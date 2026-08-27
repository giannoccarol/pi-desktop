"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { app, shell } = require("electron");

const RELEASE_URL = "https://github.com/giannoccarol/pi-desktop/releases/latest";
const UPDATER_CACHE_DIR = "pi-desktop-updater";

let autoUpdater;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

function readPackageType(resourcesPath = process.resourcesPath) {
  if (process.platform !== "linux") return "";
  if (process.env.APPIMAGE) return "appimage";
  if (process.execPath.toLowerCase().endsWith(".appimage")) return "appimage";
  try {
    return fs.readFileSync(path.join(resourcesPath, "package-type"), "utf8").trim().toLowerCase();
  } catch {
    return "native";
  }
}

/** Fallback when package-type was not bundled (builds before 0.13). */
function inferPackageType(appRef = app) {
  const fromFile = readPackageType();
  if (fromFile && fromFile !== "native") return fromFile;
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  if (process.platform !== "linux") return "";
  const exe = typeof appRef.getPath === "function" ? String(appRef.getPath("exe") || "") : "";
  if (process.env.APPIMAGE || exe.includes(".AppImage")) return "appimage";
  if (fromFile && fromFile !== "native") return fromFile;
  return "native";
}

function supportsAutoInstall(platform, packageType) {
  if (platform === "win32" || platform === "darwin") return true;
  return packageType === "appimage";
}

function supportsCachedPackageInstall(platform, packageType) {
  if (platform !== "linux" || packageType === "appimage") return false;
  return ["pacman", "deb", "rpm"].includes(packageType);
}

function getUpdaterPendingDir(homedir = os.homedir()) {
  const cacheRoot = process.env.XDG_CACHE_HOME || path.join(homedir, ".cache");
  return path.join(cacheRoot, UPDATER_CACHE_DIR, "pending");
}

function inferPackageTypeFromPath(packagePath) {
  const lower = String(packagePath || "").toLowerCase();
  if (lower.endsWith(".pacman")) return "pacman";
  if (lower.endsWith(".deb")) return "deb";
  if (lower.endsWith(".rpm")) return "rpm";
  return null;
}

function findPendingPackage(pendingDir = getUpdaterPendingDir()) {
  if (!fs.existsSync(pendingDir)) return null;
  const files = fs.readdirSync(pendingDir)
    .filter((name) => inferPackageTypeFromPath(name))
    .map((name) => path.join(pendingDir, name))
    .filter((filePath) => {
      try {
        return fs.statSync(filePath).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function parseVersionFromPackageName(filename) {
  const match = String(filename || "").match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const normalize = (value) => String(value || "").split(/[.-]/).map((part) => parseInt(part, 10) || 0);
  const left = normalize(a);
  const right = normalize(b);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function clearPendingPackages(pendingDir = getUpdaterPendingDir()) {
  if (!fs.existsSync(pendingDir)) return;
  for (const name of fs.readdirSync(pendingDir)) {
    if (!inferPackageTypeFromPath(name) && name !== "update-info.json") continue;
    try { fs.unlinkSync(path.join(pendingDir, name)); } catch {}
  }
}

function pendingPackageNeedsInstall(packagePath, currentVersion) {
  const pendingVersion = parseVersionFromPackageName(path.basename(packagePath));
  if (!pendingVersion || !currentVersion) return true;
  return compareVersions(pendingVersion, currentVersion) > 0;
}

function resolvePackageTypeForInstall(configuredType, packagePath) {
  if (packagePath) {
    const inferred = inferPackageTypeFromPath(packagePath);
    if (inferred) return inferred;
  }
  if (configuredType === "pacman" || configuredType === "deb" || configuredType === "rpm") {
    return configuredType;
  }
  return null;
}

function buildCachedInstallCommand(packageType, packagePath) {
  switch (packageType) {
    case "pacman":
      return ["pkexec", "pacman", "-U", "--noconfirm", packagePath];
    case "deb":
      return ["pkexec", "dpkg", "-i", packagePath];
    case "rpm":
      return ["pkexec", "rpm", "-Uvh", packagePath];
    default:
      return [];
  }
}

class UpdateService {
  constructor(window, dependencies = {}) {
    this.window = window || null;
    this.notify = dependencies.notify || ((channel, payload) => {
      if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, payload);
    });
    this.app = dependencies.app || app;
    this.shell = dependencies.shell || shell;
    this.autoUpdater = dependencies.autoUpdater || autoUpdater;
    this.platform = dependencies.platform || process.platform;
    this.spawnProcess = dependencies.spawn || spawn;
    this.timers = {
      setTimeout: dependencies.setTimeout || setTimeout,
      setInterval: dependencies.setInterval || setInterval,
      setImmediate: dependencies.setImmediate || setImmediate,
      clearTimeout: dependencies.clearTimeout || clearTimeout,
      clearInterval: dependencies.clearInterval || clearInterval,
    };
    this.initialized = false;
    this.startupTimer = null;
    this.timer = null;
    this.updaterListeners = [];
    this.packageType = inferPackageType(this.app);
    this.autoInstall = supportsAutoInstall(this.platform, this.packageType);
    this.cachedInstall = supportsCachedPackageInstall(this.platform, this.packageType);
    this.pendingPackagePath = null;
    this.state = {
      status: this.app.isPackaged ? "idle" : "disabled",
      currentVersion: this.app.getVersion(),
      availableVersion: null,
      progress: 0,
      error: null,
      packageType: this.packageType,
      autoInstall: this.autoInstall,
      cachedInstall: this.cachedInstall,
      pendingPackagePath: null,
    };
  }

  setWindow(window) {
    this.window = window;
    this.broadcast();
  }

  initialize() {
    if (this.initialized) {
      this.syncPendingPackageState();
      this.broadcast();
      return;
    }
    this.initialized = true;
    if (!this.app.isPackaged) {
      this.broadcast();
      return;
    }
    if (!this.autoUpdater) {
      this.setState({ status: "disabled", error: "electron-updater not available" });
      return;
    }

    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = this.autoInstall;
    this.autoUpdater.allowDowngrade = false;
    this.autoUpdater.allowPrerelease = this.app.getVersion().includes("-");

    this.listenToUpdater("checking-for-update", () => this.setState({ status: "checking", error: null }));
    this.listenToUpdater("update-available", (info) => this.setState({
      status: "available",
      availableVersion: info.version,
      progress: 0,
      error: null,
    }));
    this.listenToUpdater("update-not-available", () => this.setState({
      status: "idle",
      availableVersion: null,
      progress: 0,
      error: null,
    }));
    this.listenToUpdater("download-progress", (progress) => this.setState({
      status: "downloading",
      progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      error: null,
    }));
    this.listenToUpdater("update-downloaded", (info) => this.setState({
      status: "downloaded",
      availableVersion: info.version,
      progress: 100,
      error: null,
    }));
    this.listenToUpdater("error", (error) => this.setState({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }));

    this.syncPendingPackageState();
    this.startupTimer = this.timers.setTimeout(() => this.check(false), 15000);
    this.startupTimer.unref?.();
    this.timer = this.timers.setInterval(() => this.check(false), 6 * 60 * 60 * 1000);
    this.timer.unref?.();
    this.broadcast();
  }

  listenToUpdater(event, listener) {
    if (!this.autoUpdater) return;
    this.autoUpdater.on(event, listener);
    this.updaterListeners.push([event, listener]);
  }

  destroy() {
    if (this.startupTimer) this.timers.clearTimeout(this.startupTimer);
    if (this.timer) this.timers.clearInterval(this.timer);
    this.startupTimer = null;
    this.timer = null;
    for (const [event, listener] of this.updaterListeners.splice(0)) {
      this.autoUpdater?.removeListener?.(event, listener);
    }
    this.window = null;
    this.initialized = false;
  }

  findCachedPendingPackage() {
    if (!this.cachedInstall || this.platform !== "linux") return null;
    const pending = findPendingPackage(getUpdaterPendingDir());
    if (!pending || !pendingPackageNeedsInstall(pending, this.app.getVersion())) return null;
    return pending;
  }

  reconcilePendingPackage() {
    if (!this.cachedInstall || this.platform !== "linux") return;
    const pendingDir = getUpdaterPendingDir();
    const rawPending = findPendingPackage(pendingDir);
    if (rawPending && !pendingPackageNeedsInstall(rawPending, this.app.getVersion())) {
      clearPendingPackages(pendingDir);
      this.pendingPackagePath = null;
      if (["available", "downloaded", "downloading"].includes(this.state.status)) {
        this.setState({
          status: this.state.availableVersion && compareVersions(this.state.availableVersion, this.app.getVersion()) > 0
            ? "available"
            : "idle",
          progress: 0,
          error: null,
          pendingPackagePath: null,
        });
      }
      return;
    }

    if (rawPending && this.state.availableVersion) {
      const pendingVersion = parseVersionFromPackageName(path.basename(rawPending));
      if (pendingVersion && compareVersions(pendingVersion, this.state.availableVersion) < 0) {
        clearPendingPackages(pendingDir);
        this.pendingPackagePath = null;
        this.setState({
          status: "available",
          progress: 0,
          error: null,
          pendingPackagePath: null,
        });
        return;
      }
    }

    const pending = rawPending && pendingPackageNeedsInstall(rawPending, this.app.getVersion())
      ? rawPending
      : null;
    this.pendingPackagePath = pending;
    if (!pending) return;
    if (["downloading", "checking", "available"].includes(this.state.status)) return;
    if (this.state.status !== "downloaded") {
      this.setState({
        status: "downloaded",
        availableVersion: parseVersionFromPackageName(path.basename(pending)) || this.state.availableVersion,
        progress: 100,
        error: null,
        pendingPackagePath: pending,
      });
      return;
    }
    if (this.state.pendingPackagePath !== pending) {
      this.setState({ pendingPackagePath: pending });
    }
  }

  syncPendingPackageState() {
    this.reconcilePendingPackage();
  }

  getState() {
    this.syncPendingPackageState();
    return {
      ...this.state,
      pendingPackagePath: this.pendingPackagePath,
      pendingPackage: this.pendingPackagePath ? path.basename(this.pendingPackagePath) : null,
    };
  }

  async check(manual = true) {
    if (!this.app.isPackaged) {
      return { success: false, skipped: true, state: this.getState() };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available", state: this.getState() };
    }
    if (this.state.status === "downloading") {
      return { success: false, skipped: true, state: this.getState() };
    }
    if (this.state.status === "downloaded") {
      this.syncPendingPackageState();
      const pending = this.pendingPackagePath;
      const canInstall = pending && pendingPackageNeedsInstall(pending, this.app.getVersion());
      const pendingVersion = pending ? parseVersionFromPackageName(path.basename(pending)) : null;
      const newerAvailable = this.state.availableVersion
        && compareVersions(this.state.availableVersion, this.app.getVersion()) > 0;
      const pendingOlderThanAvailable = pendingVersion && this.state.availableVersion
        && compareVersions(pendingVersion, this.state.availableVersion) < 0;
      if (canInstall && !pendingOlderThanAvailable) {
        return { success: false, skipped: true, state: this.getState() };
      }
      if (!canInstall || pendingOlderThanAvailable) {
        if (newerAvailable) {
          this.setState({ status: "available", progress: 0, pendingPackagePath: null });
        } else {
          this.setState({ status: "idle", availableVersion: null, progress: 0, pendingPackagePath: null });
        }
      }
    }
    try {
      await this.autoUpdater.checkForUpdates();
      return { success: true, state: this.getState() };
    } catch (error) {
      this.setState({
        status: manual ? "error" : "idle",
        error: manual ? error.message : null,
      });
      return { success: false, error: error.message, state: this.getState() };
    }
  }

  async download() {
    this.syncPendingPackageState();
    const newerAvailable = this.state.availableVersion
      && compareVersions(this.state.availableVersion, this.app.getVersion()) > 0;
    if (this.state.status !== "available" && !newerAvailable) {
      return { success: false, error: "No update is ready to download", state: this.getState() };
    }
    if (this.state.status !== "available" && newerAvailable) {
      this.setState({ status: "available", progress: 0, error: null });
    }
    if (!this.cachedInstall && !this.autoInstall) {
      await this.shell.openExternal(RELEASE_URL).catch(() => {});
      return { success: true, manual: true, opened: true, state: this.getState() };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available", state: this.getState() };
    }
    try {
      await this.autoUpdater.downloadUpdate();
      this.syncPendingPackageState();
      return { success: true, state: this.getState() };
    } catch (error) {
      this.setState({ status: "error", error: error.message });
      return { success: false, error: error.message, state: this.getState() };
    }
  }

  async install() {
    this.syncPendingPackageState();

    if (this.cachedInstall) {
      const pending = this.pendingPackagePath ?? this.findCachedPendingPackage();
      if (!pending) {
        if (this.state.status === "downloaded") {
          await this.shell.openExternal(RELEASE_URL).catch(() => {});
          return { success: true, manual: true, opened: true, state: this.getState() };
        }
        return { success: false, error: "No downloaded update is ready to install", state: this.getState() };
      }
      const packageType = resolvePackageTypeForInstall(this.packageType, pending);
      if (!packageType) {
        return { success: false, error: "Unsupported package format", state: this.getState() };
      }
      const command = buildCachedInstallCommand(packageType, pending);
      try {
        const exitCode = await this.runInstallCommand(command);
        if (exitCode === 0) {
          clearPendingPackages(getUpdaterPendingDir());
          this.pendingPackagePath = null;
          this.setState({
            status: "idle",
            availableVersion: null,
            progress: 0,
            error: null,
            pendingPackagePath: null,
          });
          this.timers.setImmediate(() => this.app.quit());
          return { success: true, installed: true, restartRequired: true, state: this.getState() };
        }
        return {
          success: false,
          error: `Installazione terminata con codice ${exitCode}`,
          state: this.getState(),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          state: this.getState(),
        };
      }
    }

    if (this.state.status !== "downloaded") {
      return { success: false, error: "No downloaded update is ready to install", state: this.getState() };
    }
    if (!this.autoInstall) {
      await this.shell.openExternal(RELEASE_URL).catch(() => {});
      return { success: true, manual: true, opened: true, state: this.getState() };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available", state: this.getState() };
    }
    this.timers.setImmediate(() => this.autoUpdater.quitAndInstall(false, true));
    return { success: true, state: this.getState() };
  }

  runInstallCommand(command) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(command[0], command.slice(1), { stdio: "ignore" });
      child.on("error", reject);
      child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
    });
  }

  setState(patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "pendingPackagePath")) {
      this.pendingPackagePath = patch.pendingPackagePath ?? null;
    }
    this.state = {
      ...this.state,
      ...patch,
      pendingPackagePath: this.pendingPackagePath,
    };
    this.broadcast();
  }

  broadcast() {
    if (!this.window || this.window.isDestroyed()) return;
    this.notify("update:state", this.getState());
  }
}

module.exports = {
  UpdateService,
  readPackageType,
  inferPackageType,
  supportsAutoInstall,
  supportsCachedPackageInstall,
  getUpdaterPendingDir,
  findPendingPackage,
  inferPackageTypeFromPath,
  resolvePackageTypeForInstall,
  buildCachedInstallCommand,
  parseVersionFromPackageName,
  compareVersions,
  clearPendingPackages,
  pendingPackageNeedsInstall,
  RELEASE_URL,
};
