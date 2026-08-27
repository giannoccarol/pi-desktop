"use strict";

const fs = require("fs");
const path = require("path");

function readInstalledPackageVersion(resourcesPath, readFile = fs.readFileSync) {
  try {
    const raw = readFile(path.join(resourcesPath, "app.asar", "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" && pkg.version.trim() ? pkg.version.trim() : null;
  } catch {
    return null;
  }
}

function isRunningStale(runningVersion, installedVersion) {
  if (!runningVersion || !installedVersion) return false;
  return runningVersion !== installedVersion;
}

function snapshotBinaryMtime(execPath, statSync = fs.statSync) {
  try {
    return statSync(execPath).mtimeMs;
  } catch {
    return null;
  }
}

function binaryChangedSince(baselineMtime, execPath, statSync = fs.statSync) {
  if (baselineMtime == null) return false;
  try {
    return statSync(execPath).mtimeMs !== baselineMtime;
  } catch {
    return false;
  }
}

function detectStaleInstall({ runningVersion, resourcesPath, execPath, baselineMtime, readFile, statSync }) {
  const installedVersion = readInstalledPackageVersion(resourcesPath, readFile);
  const staleByVersion = isRunningStale(runningVersion, installedVersion);
  const staleByMtime = binaryChangedSince(baselineMtime, execPath, statSync);
  if (!staleByVersion && !staleByMtime) return null;
  return {
    runningVersion,
    installedVersion: installedVersion || runningVersion,
    reason: staleByVersion ? "version" : "mtime",
  };
}

function startStaleInstallWatch(deps) {
  const {
    app,
    notify,
    runningVersion,
    resourcesPath = process.resourcesPath,
    execPath = process.execPath,
    intervalMs = 45_000,
    readFile = fs.readFileSync,
    statSync = fs.statSync,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = deps;

  if (!app?.isPackaged) return () => {};

  let baselineMtime = snapshotBinaryMtime(execPath, statSync);
  let notified = false;

  const tick = () => {
    if (notified) return;
    const payload = detectStaleInstall({
      runningVersion,
      resourcesPath,
      execPath,
      baselineMtime,
      readFile,
      statSync,
    });
    if (!payload) return;
    notified = true;
    notify(payload);
  };

  const timer = setIntervalFn(tick, intervalMs);
  timer.unref?.();
  app.on("browser-window-focus", (_ev, win) => {
    if (win && !win.isDestroyed()) tick();
  });

  return () => clearIntervalFn(timer);
}

function performHandoverRelaunch(deps) {
  const {
    app,
    runtime,
    appUpdateService,
    execPath = process.execPath,
    args = process.argv.slice(1),
    exitTimeoutMs = 3000,
    setTimeoutFn = setTimeout,
  } = deps;

  try {
    app.relaunch({ execPath, args });
  } catch (err) {
    console.warn("[single-instance] relaunch fallito:", err.message);
  }
  setTimeoutFn(() => {
    try { app.exit(0); } catch {}
  }, exitTimeoutMs);
  try { appUpdateService?.destroy(); } catch {}
  try { runtime?.stop(); } catch {}
  app.quit();
}

module.exports = {
  readInstalledPackageVersion,
  isRunningStale,
  snapshotBinaryMtime,
  binaryChangedSince,
  detectStaleInstall,
  startStaleInstallWatch,
  performHandoverRelaunch,
};
