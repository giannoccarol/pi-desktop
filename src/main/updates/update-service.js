"use strict";

const fs = require("fs");
const path = require("path");
const { app, shell } = require("electron");

const RELEASE_URL = "https://github.com/giannoccarol/pi-desktop/releases/latest";

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

function supportsAutoInstall(platform, packageType) {
  if (platform === "win32" || platform === "darwin") return true;
  return packageType === "appimage";
}

class UpdateService {
  constructor(window, dependencies = {}) {
    this.window = window || null;
    this.notify = dependencies.notify || ((channel, payload) => {
      if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, payload);
    });
    this.app = dependencies.app || app;
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
    this.packageType = readPackageType();
    this.autoInstall = supportsAutoInstall(process.platform, this.packageType);
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

  getState() {
    return { ...this.state };
  }

  async check(manual = true) {
    if (!this.app.isPackaged) {
      return { success: false, skipped: true, state: this.getState() };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available", state: this.getState() };
    }
    if (["downloading", "downloaded"].includes(this.state.status)) {
      return { success: false, skipped: true, state: this.getState() };
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

  install() {
    if (this.state.status !== "downloaded") {
      return { success: false, error: "No downloaded update is ready to install" };
    }
    if (!this.autoUpdater) {
      return { success: false, error: "Updater not available" };
    }
    if (!this.autoInstall) {
      shell.openExternal(RELEASE_URL).catch(() => {});
      return { success: true, manual: true };
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

module.exports = { UpdateService, readPackageType, supportsAutoInstall, RELEASE_URL };
