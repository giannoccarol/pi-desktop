"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { app, shell } = require("electron");

const RELEASE_URL = "https://github.com/giannoccarol/pi-desktop/releases/latest";
const UPDATER_CACHE_DIR = "pi-desktop-updater";

const LINUX_PACKAGE_EXT = {
  pacman: ".pacman",
  deb: ".deb",
  rpm: ".rpm",
};

let autoUpdater;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

function readPackageType() {
  try {
    return fs.readFileSync(path.join(process.resourcesPath, "package-type"), "utf8").trim().toLowerCase();
  } catch {
    return "";
  }
}

/** Fallback when package-type was not bundled (builds before 0.13). */
function inferPackageType(appRef = app) {
  const fromFile = readPackageType();
  if (fromFile) return fromFile;
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  if (process.platform !== "linux") return "";
  const exe = typeof appRef.getPath === "function" ? String(appRef.getPath("exe") || "") : "";
  if (process.env.APPIMAGE || exe.includes(".AppImage")) return "appimage";
  // Pacman/deb/rpm installs under /usr or /opt — no auto-install via electron-updater.
  return "pacman";
}

function supportsAutoInstall(platform, packageType) {
  if (platform === "win32" || platform === "darwin") return true;
  return packageType === "appimage";
}

function supportsCachedPackageInstall(packageType) {
  return Object.prototype.hasOwnProperty.call(LINUX_PACKAGE_EXT, packageType);
}

function getUpdaterPendingDir(homedir = os.homedir()) {
  const cacheRoot = process.env.XDG_CACHE_HOME || path.join(homedir, ".cache");
  return path.join(cacheRoot, UPDATER_CACHE_DIR, "pending");
}

function findPendingPackage(packageType, pendingDir = getUpdaterPendingDir()) {
  const ext = LINUX_PACKAGE_EXT[packageType];
  if (!ext || !fs.existsSync(pendingDir)) return null;
  const files = fs.readdirSync(pendingDir)
    .filter((name) => name.endsWith(ext))
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

function installLinuxPackage(packagePath, packageType, spawnImpl = spawn) {
  return new Promise((resolve) => {
    const args = packageType === "deb"
      ? ["dpkg", "-i", packagePath]
      : packageType === "rpm"
        ? ["dnf", "install", "-y", packagePath]
        : ["pacman", "-U", "--noconfirm", packagePath];
    const child = spawnImpl("pkexec", args, { stdio: "ignore" });
    child.on("error", (error) => resolve({ success: false, error: error.message }));
    child.on("close", (code) => {
      if (code === 0) resolve({ success: true });
      else resolve({ success: false, error: `Installazione terminata con codice ${code}` });
    });
  });
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
    this.autoInstall = supportsAutoInstall(process.platform, this.packageType);
    this.spawnImpl = dependencies.spawn || spawn;
    this.state = {
      status: this.app.isPackaged ? "idle" : "disabled",
      currentVersion: this.app.getVersion(),
      availableVersion: null,
      progress: 0,
      error: null,
      packageType: this.packageType,
      autoInstall: this.autoInstall,
    };
  }

  setWindow(window) {
    this.window = window;
    this.broadcast();
  }

  initialize() {
    if (this.initialized) {
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
    this.listenToUpdater("update-downloaded", (info) => {
      this.setState({
        status: "downloaded",
        availableVersion: info.version,
        progress: 100,
        error: null,
      });
    });
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

  getPendingPackagePath() {
    return findPendingPackage(this.packageType, getUpdaterPendingDir());
  }

  syncPendingPackageState() {
    if (!supportsCachedPackageInstall(this.packageType)) return;
    const pending = this.getPendingPackagePath();
    if (!pending) return;
    if (["idle", "available", "downloaded"].includes(this.state.status)) {
      this.setState({ status: "downloaded", progress: 100, error: null });
    }
  }

  getState() {
    const state = { ...this.state, packageType: this.packageType, autoInstall: this.autoInstall };
    const pending = supportsCachedPackageInstall(this.packageType) ? this.getPendingPackagePath() : null;
    state.pendingPackage = pending ? path.basename(pending) : null;
    if (!this.autoInstall && state.status === "downloaded" && !pending) {
      state.status = "available";
      state.progress = 0;
    }
    return state;
  }

  async check(manual = true) {
    if (!this.app.isPackaged) {
      return { success: false, skipped: true, state: this.getState() };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available", state: this.getState() };
    }
    if (this.autoInstall && ["downloading", "downloaded"].includes(this.state.status)) {
      return { success: false, skipped: true, state: this.getState() };
    }
    if (!this.autoInstall && this.state.status === "downloaded" && !this.getPendingPackagePath()) {
      this.setState({ status: "available", progress: 0 });
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
    if (!this.autoInstall) {
      if (supportsCachedPackageInstall(this.packageType)) {
        if (this.state.status === "downloaded" && this.getPendingPackagePath()) {
          return { success: true, skipped: true, state: this.getState() };
        }
        if (this.state.status === "available" && this.autoUpdater) {
          try {
            await this.autoUpdater.downloadUpdate();
            this.syncPendingPackageState();
            return { success: true, state: this.getState() };
          } catch (error) {
            this.setState({ status: "error", error: error.message });
            return { success: false, error: error.message, state: this.getState() };
          }
        }
      }
      if (this.state.status === "available" || this.state.status === "downloaded") {
        await this.shell.openExternal(RELEASE_URL).catch(() => {});
        return { success: true, manual: true, opened: true, state: this.getState() };
      }
      return { success: false, error: "No update is ready to download", state: this.getState() };
    }
    if (this.state.status !== "available") {
      return { success: false, error: "No update is ready to download", state: this.getState() };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available", state: this.getState() };
    }
    try {
      await this.autoUpdater.downloadUpdate();
      return { success: true, state: this.getState() };
    } catch (error) {
      this.setState({ status: "error", error: error.message });
      return { success: false, error: error.message, state: this.getState() };
    }
  }

  async install() {
    if (!this.autoInstall) {
      const pending = supportsCachedPackageInstall(this.packageType) ? this.getPendingPackagePath() : null;
      if (pending && (this.state.status === "downloaded" || this.state.status === "available")) {
        const result = await installLinuxPackage(pending, this.packageType, this.spawnImpl);
        if (!result.success) return { success: false, error: result.error || "Installazione fallita" };
        this.timers.setImmediate(() => this.app.quit());
        return { success: true, installed: true, packagePath: pending };
      }
      if (this.state.status === "available" || this.state.status === "downloaded") {
        this.shell.openExternal(RELEASE_URL).catch(() => {});
        return { success: true, manual: true, opened: true };
      }
      return { success: false, error: "No update is available" };
    }
    if (this.state.status !== "downloaded") {
      return { success: false, error: "No downloaded update is ready to install" };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available" };
    }
    this.timers.setImmediate(() => this.autoUpdater.quitAndInstall(false, true));
    return { success: true };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
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
  installLinuxPackage,
  RELEASE_URL,
};
