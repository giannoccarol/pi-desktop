"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, clipboard, globalShortcut, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { fileURLToPath } = require("node:url");
// execFile moved to mention-service.js

const { RuntimeTabs } = require("./runtime-tabs");
const sessionsStore = require("../services/sessions");
// Scansione sessioni fuori dall'event loop del main: le funzioni sync di
// sessions.js (fs sincrono su migliaia di file JSONL) bloccavano tutte le
// IPC, delta di streaming inclusi, a ogni re-scan della sidebar.
const sessionsAsync = require("../services/session-worker-manager");
const updater = require("../updates/updater");
const providerStore = require("../services/provider-store");
const packageStore = require("../services/package-store");
const packageResources = require("../services/package-resource-service");
const piSettingsStore = require("../services/pi-settings-store");
const authService = require("../services/auth-service");
const { createMentionService } = require("../services/mention-service");
const gitService = require("../services/git-service");
const ipcSanitize = require("../services/ipc-sanitize");
const mobileWeb = require("../services/mobile-web");
const { UpdateService } = require("../updates/update-service");
const { shouldHandoverToSecondInstance } = require("./single-instance");
const { startStaleInstallWatch, performHandoverRelaunch } = require("./version-watch");

// Registro handler IPC riusabile anche dal bridge web (mobile-web): handle()
// registra su ipcMain e memoizza la fn così callIpc() può riusarla via HTTP.
const ipcHandlers = new Map();
function handle(channel, fn) {
  ipcHandlers.set(channel, fn);
  ipcMain.handle(channel, fn);
}
function callIpc(channel, args = []) {
  const fn = ipcHandlers.get(channel);
  if (!fn) throw new Error(`Canale IPC sconosciuto: ${channel}`);
  return fn({ sender: null }, ...args);
}

// In sviluppo usa una userData dedicata: evita che `npm start` collida con
// l'istanza installata (stesso single-instance lock su ~/.config/Pi Desktop)
// e che dev e produzione condividano settings/sessioni.
if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "Pi Desktop (dev)"));
}

// Override esplicito via env: usato dalla suite e2e (Playwright) per isolare
// completamente lo stato dell'app sotto test.
if (process.env.PI_DESKTOP_USER_DATA) {
  app.setPath("userData", process.env.PI_DESKTOP_USER_DATA);
}

let win = null;
let tray = null;
let settings = null;
let appUpdateService = null;
const GLOBAL_HOTKEY = "CommandOrControl+Shift+P";
let nextAuthRequestId = 1;
const pendingAuthRequests = new Map();
const authControllers = new Map();
let sessionsListCache = null;
let sessionsListCacheAt = 0;
const SESSIONS_CACHE_TTL_MS = 750;
const sessionsWatchers = new Set();
let sessionsWatchTimer = null;
function closeSessionsWatchers(){
  for(const watcher of sessionsWatchers) try{ watcher.close(); }catch{}
  sessionsWatchers.clear();
  if(sessionsWatchTimer){ clearTimeout(sessionsWatchTimer); sessionsWatchTimer=null; }
}
function notifySessionsChanged(rescan=false){
  sessionsListCache=null; sessionsListCacheAt=0;
  if(sessionsWatchTimer) clearTimeout(sessionsWatchTimer);
  sessionsWatchTimer=setTimeout(()=>{
    sessionsWatchTimer=null;
    try{ sendToUi("sessions:changed"); }catch{}
    if(rescan) restartSessionsWatcher();
  },120);
  sessionsWatchTimer.unref?.();
}
function restartSessionsWatcher(){
  closeSessionsWatchers();
  let dir=""; try{ dir = sessionsDir(); }catch{ return; }
  if(!dir || !isDirectory(dir)) return;
  try{
    sessionsWatchers.add(fs.watch(dir, { recursive: false }, ()=>notifySessionsChanged(true)));
    try{
      const subs = fs.readdirSync(dir, {withFileTypes:true}).filter(d=>d.isDirectory());
      for(const sub of subs){
        try{ sessionsWatchers.add(fs.watch(path.join(dir, sub.name), ()=>notifySessionsChanged(false))); }catch{}
      }
    }catch{}
  }catch(err){ console.warn("[sessionsWatcher]", err.message); }
}

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  const defaults = {
    cwd: app.getPath("home"),
    projects: [app.getPath("home")],
    piPath: "",
    sessionsDir: "",
    sidebarVisible: true,
    language: "it",
    userName: "",
    userNamePromptSeen: false,
    lastModel: null,
    lastThinkingLevel: null,
    sessionPreferences: {},
    sessionMeta: {},
    budgets: {},
    notificationPrefs: { perProjectMute: {}, notifyOnToolLong: true, dndUntil: 0 },
    theme: "",
    notificationsEnabled: true,
    notificationsSound: false,
    sidebarWidth: null,
    diffMode: "unified",
    expandedProjects: [],
    composerAutoRetry: true,
    onboardingSeen: false,
    terminalHistory: [],
    mobileWebEnabled: true,
    mobileWebPort: 3923,
    mobileWebToken: "",
  };
  try {
    const loaded = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) };
    try{ fs.chmodSync(settingsFile(), 0o600); }catch{}
    const projects = Array.isArray(loaded.projects) ? loaded.projects : [loaded.cwd];
    loaded.projects = [...new Set([loaded.cwd, ...projects].filter((value) => typeof value === "string" && value.trim()))];
    loaded.sessionPreferences = loaded.sessionPreferences && typeof loaded.sessionPreferences === "object" ? loaded.sessionPreferences : {};
    loaded.sessionMeta = loaded.sessionMeta && typeof loaded.sessionMeta === "object" ? loaded.sessionMeta : {};
    loaded.budgets = loaded.budgets && typeof loaded.budgets === "object" ? loaded.budgets : {};
    loaded.notificationPrefs = loaded.notificationPrefs && typeof loaded.notificationPrefs === "object" ? { perProjectMute: {}, notifyOnToolLong: true, dndUntil: 0, ...loaded.notificationPrefs } : { perProjectMute: {}, notifyOnToolLong: true, dndUntil: 0 };
    if (!loaded.notificationPrefs.perProjectMute || typeof loaded.notificationPrefs.perProjectMute !== "object") loaded.notificationPrefs.perProjectMute = {};
    loaded.expandedProjects = Array.isArray(loaded.expandedProjects)
      ? [...new Set(loaded.expandedProjects.filter((value) => typeof value === "string" && value.trim()))]
      : [];
    if (loaded.notificationsEnabled === undefined) loaded.notificationsEnabled = true;
    if (loaded.notificationsSound === undefined) loaded.notificationsSound = false;
    if (loaded.composerAutoRetry === undefined) loaded.composerAutoRetry = true;
    if (loaded.diffMode !== "split") loaded.diffMode = "unified";
    if (typeof loaded.theme !== "string") loaded.theme = "";
    if (loaded.userNamePromptSeen === undefined && String(loaded.userName || "").trim()) {
      loaded.userNamePromptSeen = true;
    }
    if (loaded.onboardingSeen === undefined) loaded.onboardingSeen = false;
    if (!Array.isArray(loaded.terminalHistory)) loaded.terminalHistory = [];
    if (loaded.mobileWebEnabled === undefined) loaded.mobileWebEnabled = true;
    const webPort = Number(loaded.mobileWebPort);
    loaded.mobileWebPort = Number.isFinite(webPort) ? Math.max(1024, Math.min(65535, Math.round(webPort))) : 3923;
    if (typeof loaded.mobileWebToken !== "string") loaded.mobileWebToken = "";
    return loaded;
  } catch {
    return defaults;
  }
}

function saveSettings() {
  const target=settingsFile();
  const temp=`${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { encoding:"utf8", mode:0o600 });
    fs.renameSync(temp,target);
    try{ fs.chmodSync(target,0o600); }catch{}
    return true;
  } catch (err) {
    try{ fs.unlinkSync(temp); }catch{}
    console.error("[settings] salvataggio fallito:", err);
    return false;
  }
}

function sanitizeMessagesForIpc(payload, maxMessages, maxBytes) {
  try {
    return ipcSanitize.sanitizeMessagesPayload(payload, maxMessages, maxBytes);
  } catch (err) {
    console.error("[sanitize messages] fallita:", err);
    return { messages: [], truncated: false, hiddenCount: 0, loadError: "sanitize_failed" };
  }
}

function sessionsDir() {
  if (!settings.sessionsDir) return sessionsStore.defaultSessionsDir();
  const expanded = settings.sessionsDir.startsWith("~")
    ? path.join(app.getPath("home"), settings.sessionsDir.slice(1))
    : settings.sessionsDir;
  return path.resolve(settings.cwd || app.getPath("home"), expanded);
}

function isDirectory(value) {
  try {
    return typeof value === "string" && fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function resolveProjectPath(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(settings?.language === "en" ? "Invalid project path" : "Percorso progetto non valido");
  const resolved = path.resolve(value);
  if (!isDirectory(resolved)) throw new Error(settings?.language === "en" ? "Project folder not available" : "La cartella del progetto non è disponibile");
  return resolved;
}

function publicSettings() {
  return { ...settings, sessionsDirResolved: sessionsDir() };
}

function mobileWebDeps() {
  return {
    settings,
    saveSettings,
    sessionsDir,
    sessionsAsync,
    sanitize: sanitizeMessagesForIpc,
    runtime,
    ensureRuntime,
    notifySessionsChanged,
    callIpc,
    devPortOffset: app.isPackaged ? 0 : 1,
  };
}

async function listProviderSettings() {
  const nativeProviders = await authService.listProviders(settings).catch(() => null);
  return providerStore.listProviders(undefined, nativeProviders);
}

function sendAuthEvent(payload) {
  sendToUi("pi:auth-request", payload);
}

// recapito unificato desktop + client web (SSE): non lancia mai.
function sendToUi(channel, payload) {
  if (win && !win.isDestroyed()) { try { win.webContents.send(channel, payload); } catch {} }
  try { mobileWeb.broadcast(channel, payload); } catch {}
}

function requestAuthPrompt(providerId, prompt, signal) {
  const id = `auth-${nextAuthRequestId++}`;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      pendingAuthRequests.delete(id);
      reject(new Error("Login annullato"));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    pendingAuthRequests.set(id, {
      resolve: (value) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      reject: (error) => {
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    });
    sendAuthEvent({ kind: "prompt", id, providerId, prompt: { ...prompt, signal: undefined } });
  });
}

function resolveWindowIcon() {
  const candidates = [];
  // Dev: projectRoot/build/icon.png / icon.png
  candidates.push(path.join(__dirname, "..", "..", "build", "icon.png"));
  candidates.push(path.join(__dirname, "..", "..", "icon.png"));
  candidates.push(path.join(__dirname, "..", "..", "build", "icons", "512x512.png"));
  // Packaged: resourcesPath/build/icon.png (buildResources) e varianti
  try { candidates.push(path.join(process.resourcesPath, "build", "icon.png")); } catch {}
  try { candidates.push(path.join(process.resourcesPath, "build", "icons", "512x512.png")); } catch {}
  try { candidates.push(path.join(process.resourcesPath, "app", "build", "icon.png")); } catch {}
  try { candidates.push(path.join(process.resourcesPath, "icon.png")); } catch {}
  // Fallback via app.getAppPath()
  try { candidates.push(path.join(app.getAppPath(), "build", "icon.png")); } catch {}
  try { candidates.push(path.join(app.getAppPath(), "build", "icons", "512x512.png")); } catch {}
  try { candidates.push(path.join(app.getAppPath(), "icon.png")); } catch {}
  // System icon locations su Arch/Linux installato via pacman/deb
  candidates.push("/usr/share/pixmaps/pi-desktop.png");
  candidates.push("/usr/share/icons/hicolor/1024x1024/apps/pi-desktop.png");
  candidates.push("/usr/share/icons/hicolor/512x512/apps/pi-desktop.png");
  candidates.push("/usr/share/icons/hicolor/256x256/apps/pi-desktop.png");
  candidates.push("/usr/share/icons/hicolor/128x128/apps/pi-desktop.png");
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch {}
  }
  return undefined;
}

function showWindow() {
  // Guard robusto: isDestroyed() stesso può lanciare "Object has been destroyed" su win distrutta in Electron <30
  let destroyed = false;
  try { destroyed = !win || (typeof win.isDestroyed === "function" && win.isDestroyed()); } catch { destroyed = true; }
  if (destroyed) {
    try { if (win) win = null; } catch {}
    try { createWindow(); } catch (err) { console.warn("[showWindow] createWindow fallita:", err.message); }
    return;
  }
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  } catch (err) {
    console.warn("[showWindow] accesso a win distrutta:", err.message);
    try { win = null; } catch {}
    try { createWindow(); } catch {}
  }
}

function tTray(key, vars = {}) {
  const lang = (settings && settings.language === "en") ? "en" : "it";
  const dict = {
    it: { "tray.show": "Mostra Pi Desktop", "tray.newChat": "Nuova chat", "tray.quit": "Esci", "tray.tooltip": "Pi Desktop" },
    en: { "tray.show": "Show Pi Desktop", "tray.newChat": "New chat", "tray.quit": "Quit", "tray.tooltip": "Pi Desktop" },
  };
  let str = (dict[lang] && dict[lang][key]) || dict.it[key] || key;
  for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
  return str;
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: tTray("tray.show"), click: () => showWindow() },
    { label: tTray("tray.newChat"), click: () => { console.log("[tray] nuova chat richiesta"); showWindow(); try { sendToUi("pi:tray-new-chat"); } catch {} } },
    { type: "separator" },
    { label: tTray("tray.quit"), role: "quit" },
  ]);
}

function updateTrayTooltip(status = "") {
  try {
    if (!tray) return;
    const base = tTray("tray.tooltip");
    const text = status ? `${base} — ${status}` : base;
    tray.setToolTip(text);
  } catch {}
}

function resolveTrayIcon() {
  // Try dedicated tray assets first, then fallback to window icon
  const candidates = [];
  try { candidates.push(path.join(__dirname, "..", "..", "build", "tray.png")); } catch {}
  try { candidates.push(path.join(__dirname, "..", "..", "renderer", "img", "pi-logo-on-light.svg")); } catch {}
  const winIcon = resolveWindowIcon();
  if (winIcon) candidates.push(winIcon);
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch {}
  }
  return winIcon || null;
}

function createTray() {
  if (tray) return tray;
  try {
    let image = null;
    const iconPath = resolveTrayIcon();
    if (iconPath) {
      try {
        // SVG not supported for Tray on some platforms — try PNG fallback via buffer if needed
        if (iconPath.endsWith(".svg")) {
          try {
            const svgContent = fs.readFileSync(iconPath, "utf8");
            // Fallback: try to create from path directly, Electron will rasterize if possible; otherwise use empty
            image = nativeImage.createFromPath(iconPath);
            if (image.isEmpty() && svgContent) {
              // Try create from buffer (may still be empty on some platforms, but we handle)
              const buf = Buffer.from(svgContent);
              const fromBuf = nativeImage.createFromBuffer(buf);
              if (!fromBuf.isEmpty()) image = fromBuf;
            }
          } catch {}
        } else {
          image = nativeImage.createFromPath(iconPath);
        }
        if (image && !image.isEmpty()) {
          try { image = image.resize({ width: 16, height: 16 }); } catch {}
        } else {
          image = null;
        }
      } catch {}
    }
    if (!image || image.isEmpty()) {
      try { image = nativeImage.createEmpty(); } catch { return null; }
      if (image.isEmpty()) {
        // last resort: 16x16 transparent PNG buffer
        try {
          const emptyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AQbEAw0SE8gGAAAAO0lEQVQ4y2NgGAXD/////4MhwI8wMjL6HwQzMDAwMDEwMTAwMDEwMTAwMDEwMTAwMDEwMTAwMDEwMTAwAAD//wMA9DERfkAAAAASUVORK5CYII=", "base64");
          image = nativeImage.createFromBuffer(emptyPng);
        } catch {}
      }
    }
    tray = new Tray(image);
    updateTrayTooltip();
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => showWindow());
    return tray;
  } catch (err) {
    console.warn("[tray] creazione fallita:", err.message);
    try { tray?.destroy(); } catch {}
    tray = null;
    return null;
  }
}

function destroyTray() {
  try { tray?.destroy(); } catch {}
  tray = null;
}

function registerGlobalShortcut() {
  try {
    globalShortcut.unregisterAll();
    const ok = globalShortcut.register(GLOBAL_HOTKEY, () => showWindow());
    if (!ok) console.warn("[hotkey] registrazione fallita:", GLOBAL_HOTKEY);
    return ok;
  } catch (err) {
    console.warn("[hotkey] errore:", err.message);
    return false;
  }
}

function unregisterGlobalShortcut() {
  try { globalShortcut.unregisterAll(); } catch {}
}

function createWindow() {
  // Avoid creating duplicate if a valid window already exists
  let existingAlive = false;
  try { existingAlive = Boolean(win && typeof win.isDestroyed === "function" && !win.isDestroyed()); } catch { existingAlive = false; }
  if (existingAlive) {
    try { showWindow(); } catch {}
    return win;
  }
  try { if (win) win = null; } catch {}
  const windowIcon = resolveWindowIcon();
  if (!windowIcon) console.warn("[window] icon not found, checked build/icon.png and icon.png");
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    icon: windowIcon,
    // Titlebar nativa esclusa: la finestra si trascina dalla topbar del renderer
    // e i pulsanti riduci/ingrandisci/chiudi sono disegnati dall'app (win-controls).
    // Su macOS si mantiene la barra nascosta con i traffic light di sistema.
    frame: process.platform === "darwin" ? undefined : false,
    titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.on("closed", () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
  attachNavigationPolicy(win);
  attachContextMenu(win);
  if (!appUpdateService) {
    appUpdateService = new UpdateService(win);
  } else {
    appUpdateService.setWindow(win);
  }
  appUpdateService.initialize();
  return win;
}

// Evita dialog "A JavaScript error occurred in the main process" su eccezioni non catturate
// (showWindow/second-instance race). Logga e continua.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

// Single instance lock con handoff tra versioni.
// La seconda istanza passa la propria versione come additionalData: se e' diversa
// (app aggiornata/reinstallata), quella vecchia si spegne e rilancia dal binario
// attualmente installato. Cosi' dopo un update il primo avvio mostra davvero la
// nuova versione invece del vecchio processo rimasto vivo nel tray.
const APP_VERSION = app.getVersion();
let handingOverToNewVersion = false;
let stopStaleInstallWatch = () => {};

function notifyStaleInstall(payload) {
  sendToUi("app:stale-install", payload);
}

function relaunchInstalledApp() {
  if (handingOverToNewVersion) return;
  handingOverToNewVersion = true;
  stopStaleInstallWatch();
  performHandoverRelaunch({ app, runtime, appUpdateService });
}

if (!app.requestSingleInstanceLock({ version: APP_VERSION })) {
  app.quit();
} else {
  app.on("second-instance", (_ev, _argv, additionalData) => {
    if (handingOverToNewVersion) return;
    if (!shouldHandoverToSecondInstance(APP_VERSION, additionalData)) {
      try { showWindow(); } catch (err) { console.warn("[second-instance] showWindow fallita:", err.message); }
      return;
    }
    handingOverToNewVersion = true;
    const incoming = additionalData && typeof additionalData === "object" ? additionalData.version : "?";
    console.log(`[single-instance] seconda istanza v${incoming} != attuale v${APP_VERSION}: riavvio sull'app aggiornata`);
    stopStaleInstallWatch();
    performHandoverRelaunch({ app, runtime, appUpdateService });
  });

  app.whenReady().then(() => {
    settings = loadSettings();
    try{ restartSessionsWatcher(); }catch{}
    createWindow();
    try { createTray(); } catch {}
    try { registerGlobalShortcut(); } catch {}
    if (app.isPackaged) {
      stopStaleInstallWatch = startStaleInstallWatch({
        app,
        runningVersion: APP_VERSION,
        notify: notifyStaleInstall,
      });
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    // Warm start: pre-spawn an ephemeral pi process so the first "nuova chat"
    // appears instantly instead of waiting for a cold spawn.
    ensureRuntime().catch((err) => console.warn("[warm-start] fallito:", err.message));
    // Endpoint web mobile (Tailscale): http://<ip-tailscale>:3923/?token=…
    try { mobileWeb.start(mobileWebDeps()); } catch (err) { console.warn("[mobile-web] avvio fallito:", err.message); }
  });
}

app.on("window-all-closed", () => {
  // Keep app running in tray if tray exists; otherwise quit (macOS keeps app alive)
  if (process.platform === "darwin") return;
  if (tray) return;
  appUpdateService?.destroy();
  runtime.stop();
  app.quit();
});
app.on("before-quit", closeSessionsWatchers);

app.on("will-quit", () => {
  stopStaleInstallWatch();
  try { mobileWeb.stop(); } catch {}
  unregisterGlobalShortcut();
  destroyTray();
  appUpdateService?.destroy();
  runtime.stop();
});

// Expose for unit testing (not used at runtime)
if (process.env.NODE_ENV === "test" || typeof globalThis.__PI_TEST__ !== "undefined") {
  try {
    module.exports._trayTest = {
      GLOBAL_HOTKEY,
      showWindow: () => showWindow(),
      buildTrayMenu,
      createTray,
      destroyTray,
      registerGlobalShortcut,
      unregisterGlobalShortcut,
      getTray: () => tray,
      setTray: (v) => { tray = v; },
      setWin: (v) => { win = v; },
      getWin: () => win,
      updateTrayTooltip,
      resolveTrayIcon,
      tTray,
    };
  } catch {}
}

const runtime = new RuntimeTabs((channel, payload) => {
  let safe = payload;
  try {
    safe = channel === "pi:event" ? ipcSanitize.sanitizeForIpc(payload) : payload;
  } catch (err) {
    console.error("[ipc send]", channel, err);
  }
  // Niente early-return se la finestra è chiusa (tray): i client web (SSE)
  // devono ricevere gli eventi anche senza finestra desktop aperta.
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, safe); } catch (err) { console.error("[ipc send]", channel, err); }
  }
  try { mobileWeb.broadcast(channel, safe); } catch {}
});

async function ensureRuntime() {
  if (runtime.running) return;
  await runtime.ensureStarted({
    cwd: settings.cwd,
    persist: false,
    piPath: settings.piPath || undefined,
    provider: settings.lastModel?.provider,
    model: settings.lastModel?.modelId,
    sessionDir: settings.sessionsDir ? sessionsDir() : undefined,
  });
  if (settings.lastThinkingLevel) await runtime.setThinkingLevel(settings.lastThinkingLevel).catch(() => {});
}

function safePreference(value) {
  if (!value || typeof value !== "object") return {};
  const preference = {};
  if (typeof value.provider === "string" && value.provider.length < 120) preference.provider = value.provider;
  if (typeof value.modelId === "string" && value.modelId.length < 240) preference.modelId = value.modelId;
  if (typeof value.thinkingLevel === "string" && value.thinkingLevel.length < 40) preference.thinkingLevel = value.thinkingLevel;
  return preference;
}

async function rememberCurrentPreference() {
  try {
    const current = await runtime.getState();
    const preference = safePreference({
      provider: current.model?.provider,
      modelId: current.model?.id,
      thinkingLevel: current.thinkingLevel,
    });
    if (preference.provider && preference.modelId) {
      settings.lastModel = { provider: preference.provider, modelId: preference.modelId };
    }
    if (preference.thinkingLevel) settings.lastThinkingLevel = preference.thinkingLevel;
    if (current.sessionFile && Object.keys(preference).length) {
      settings.sessionPreferences[current.sessionFile] = preference;
    }
    saveSettings();
  } catch (err) {
    console.warn("[preference] remember failed:", err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

handle("settings:get", () => publicSettings());

handle("settings:set", async (_e, patch) => {
  const allowed = [
    "cwd", "piPath", "sessionsDir", "sidebarVisible", "lastModel", "language", "sessionMeta", "budgets", "notificationPrefs", "onboardingSeen", "terminalHistory",
    "userName", "userNamePromptSeen", "theme", "notificationsEnabled", "notificationsSound",
    "sidebarWidth", "diffMode", "expandedProjects", "composerAutoRetry", "mobileWebEnabled",
    "mobileWebPort",
  ];
  const previousCwd = settings.cwd;
  const previousPiPath = settings.piPath;
  const previousSessionsDir = settings.sessionsDir;
  const previousWebEnabled = settings.mobileWebEnabled;
  const previousWebPort = settings.mobileWebPort;
  for (const k of allowed) {
    if (!(k in patch)) continue;
    if (k === "cwd") settings[k] = resolveProjectPath(patch[k]);
    else if (k === "language") {
      const v = String(patch[k] || "").toLowerCase();
      if (v === "it" || v === "en") settings[k] = v;
    } else if (k === "userName") {
      settings[k] = String(patch[k] || "").trim().slice(0, 40);
    } else if (k === "userNamePromptSeen") {
      settings[k] = Boolean(patch[k]);
    } else if (k === "theme") {
      const v = String(patch[k] || "").toLowerCase();
      settings[k] = v === "dark" || v === "light" ? v : "";
    } else if (k === "notificationsEnabled" || k === "notificationsSound" || k === "composerAutoRetry") {
      settings[k] = Boolean(patch[k]);
    } else if (k === "sidebarWidth") {
      const n = Number(patch[k]);
      settings[k] = Number.isFinite(n) ? Math.max(210, Math.min(520, Math.round(n))) : null;
    } else if (k === "diffMode") {
      settings[k] = patch[k] === "split" ? "split" : "unified";
    } else if (k === "mobileWebEnabled") {
      settings[k] = Boolean(patch[k]);
    } else if (k === "mobileWebPort") {
      const n = Number(patch[k]);
      settings[k] = Number.isFinite(n) ? Math.max(1024, Math.min(65535, Math.round(n))) : 3923;
    } else if (k === "expandedProjects") {
      settings[k] = Array.isArray(patch[k])
        ? [...new Set(patch[k].filter((value) => typeof value === "string" && value.trim()))]
        : [];
    } else settings[k] = patch[k];
  }
  if ("cwd" in patch) settings.projects = [...new Set([...(settings.projects || []), settings.cwd])];
  const saveOk = saveSettings();
  if (previousCwd !== settings.cwd) {
    runtime.stop();
  } else if (previousPiPath !== settings.piPath || previousSessionsDir !== settings.sessionsDir) {
    await runtime.restart({ piPath: settings.piPath || undefined }).catch(() => runtime.stop());
  }
  try{ restartSessionsWatcher(); }catch{}
  if (previousWebEnabled !== settings.mobileWebEnabled || previousWebPort !== settings.mobileWebPort) {
    try { mobileWeb.restart(mobileWebDeps()); } catch (err) { console.warn("[mobile-web] restart fallito:", err.message); }
  }
  return { ...publicSettings(), saveOk };
});

handle("mobileWeb:get", () => ({ ...mobileWeb.info(settings), token: settings.mobileWebToken || "" }));

handle("mobileWeb:regenerateToken", () => {
  const crypto = require("crypto");
  settings.mobileWebToken = crypto.randomBytes(24).toString("hex");
  saveSettings();
  try { mobileWeb.restart(mobileWebDeps()); } catch {}
  return { ...mobileWeb.info(settings), token: settings.mobileWebToken };
});

handle("dialog:pickDirectory", async (_e, title) => {
  const res = await dialog.showOpenDialog(win, { title: title || "Scegli cartella", properties: ["openDirectory"] });
  return res.canceled ? null : res.filePaths[0];
});

handle("dialog:pickFiles", async (_e, kind = "files") => {
  const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp"];
  const res = await dialog.showOpenDialog(win, {
    title: kind === "images" ? "Aggiungi immagini" : "Aggiungi allegati",
    buttonLabel: "Allega",
    properties: ["openFile", "multiSelections"],
    filters: kind === "images" ? [{ name: "Immagini", extensions: imageExtensions }] : undefined,
  });
  if (res.canceled) return [];
  if (res.filePaths.length > 12) throw new Error("Puoi allegare al massimo 12 file per messaggio");
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  let imageBytes = 0;
  return res.filePaths.map((filePath) => {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("Allegato non valido");
    const mimeType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const attachment = { path: filePath, name: path.basename(filePath), size: stat.size, mimeType };
    if (mimeType.startsWith("image/")) {
      if (stat.size > 15 * 1024 * 1024) throw new Error(`${attachment.name}: immagine oltre 15 MB`);
      imageBytes += stat.size;
      if (imageBytes > 40 * 1024 * 1024) throw new Error("Le immagini superano complessivamente 40 MB");
      attachment.data = fs.readFileSync(filePath).toString("base64");
    }
    return attachment;
  });
});

// Ricerca file/cartelle per le menzioni @ — delegata a mention-service per testabilità
const mentionService = createMentionService(() => settings?.cwd);
const searchMentionCandidates = mentionService.searchMentionCandidates;

handle("fs:searchFiles", (_e, query) => searchMentionCandidates(query));

// Drag&drop: lista file dentro una cartella droppata (relativi alla cartella stessa)
handle("fs:listDropped", async (_e, absPath) => {
  try {
    const p = String(absPath || "").trim();
    if (!p || !isAllowedProjectPath(p)) return [];
    let stat;
    try { stat = fs.statSync(p); } catch { return []; }
    if (stat.isFile()) return [path.basename(p)];
    if (!stat.isDirectory()) return [];
    // riusa listProjectFiles se possibile, altrimenti walk minimale
    try {
      const rel = await mentionService.listProjectFiles(p);
      return rel;
    } catch { return []; }
  } catch { return []; }
});

handle("git:getStatus", async (_e, cwd) => {
  const target = cwd || settings?.cwd || process.cwd();
  if(!isAllowedProjectPath(target)) return { isGit:false, branch:null, dirty:0, label:"" };
  try { return await gitService.getGitStatus(target); } catch { return { isGit:false, branch:null, dirty:0, label:"" }; }
});

handle("window:popOutTab", async (_e, tabId) => {
  try {
    const id = String(tabId||"").trim();
    const tab = id ? runtime.list().find((t)=>t.id===id) : null;
    const title = tab ? (tab.title || tab.sessionFile || id) : "Pi Desktop";
    const pop = new BrowserWindow({
      width: 1024,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      title,
      backgroundColor: "#0f1115",
      autoHideMenuBar: true,
      icon: resolveWindowIcon(),
      frame: process.platform === "darwin" ? undefined : false,
      titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
      webPreferences: {
        preload: path.join(__dirname, "..", "..", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const url = path.join(__dirname, "..", "..", "renderer", "index.html");
    // pass tabId via query so renderer can activate it
    await pop.loadFile(url, { query: { popOutTabId: id } });
    attachNavigationPolicy(pop);
    attachContextMenu(pop);
    return { ok:true, tabId:id };
  } catch (err) { return { ok:false, error: String(err?.message||err) }; }
});

// --- controlli finestra (titlebar nativa disattivata) -----------------------
// Ogni comando agisce sulla finestra chiamante: la stessa UI serve a main e pop-out.
handle("window:minimize", (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
handle("window:toggleMaximize", (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
  return w.isMaximized();
});
handle("window:close", (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
handle("window:isMaximized", (e) => Boolean(BrowserWindow.fromWebContents(e.sender)?.isMaximized()));
// Lo stato ingrandisci/ripristina può cambiare anche fuori dal renderer (WM,
// doppio clic sulla topbar): lo si ripete a ogni transizione.
app.on("browser-window-created", (_e, w) => {
  const sendState = () => { try { w.webContents.send("window:state", { maximized: w.isMaximized() }); } catch {} try { mobileWeb.broadcast("window:state", { maximized: w.isMaximized() }); } catch {} };
  w.on("maximize", sendState);
  w.on("unmaximize", sendState);
});

handle("projects:add", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Aggiungi un progetto",
    buttonLabel: "Aggiungi progetto",
    properties: ["openDirectory"],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const projectPath = path.resolve(res.filePaths[0]);
  settings.projects = [...new Set([...(settings.projects || []), projectPath])];
  settings.cwd = projectPath;
  saveSettings();
  return publicSettings();
});

handle("projects:activate", (_e, projectPath) => {
  const resolved = resolveProjectPath(projectPath);
  const alreadyListed = (settings.projects || []).includes(resolved);
  if (settings.cwd === resolved && alreadyListed) return publicSettings();
  settings.projects = [...new Set([...(settings.projects || []), resolved])];
  settings.cwd = resolved;
  saveSettings();
  return publicSettings();
});

handle("projects:remove", (_e, projectPath) => {
  if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("Percorso progetto non valido");
  const resolved = path.resolve(projectPath);
  settings.projects = (settings.projects || []).filter((candidate) => path.resolve(candidate) !== resolved);
  if (!settings.projects.length) settings.projects = [app.getPath("home")];
  if (path.resolve(settings.cwd) === resolved) {
    settings.cwd = settings.projects[0] || app.getPath("home");
  }
  saveSettings();
  return publicSettings();
});

function isPrivateHostname(hostname){
  const host=String(hostname||"").toLowerCase().replace(/^\[|\]$/g,"");
  if(!host || host==="localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if(host==="::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const parts=host.split(".").map(Number);
  if(parts.length===4 && parts.every((part)=>Number.isInteger(part) && part>=0 && part<=255)){
    return parts[0]===10 || parts[0]===127 || parts[0]===0 || (parts[0]===169 && parts[1]===254) || (parts[0]===172 && parts[1]>=16 && parts[1]<=31) || (parts[0]===192 && parts[1]===168);
  }
  return false;
}
function isAllowedExternalUrl(url){
  try{
    const u = new URL(String(url));
    if(u.protocol==="https:"){
      if(isPrivateHostname(u.hostname)) return false;
      if(!/^[a-z0-9.-]+$/i.test(u.hostname)) return false;
      return true;
    }
    if(u.protocol==="file:"){
      const p = path.normalize(fileURLToPath(u));
      const allowedRoots = [...(settings?.projects||[]), settings?.cwd||"", app.getPath("home")].filter(Boolean).map(p=>path.resolve(String(p)));
      return allowedRoots.some(root=> p===root || p.startsWith(root+path.sep));
    }
    return false;
  }catch{ return false; }
}
function tMenu(key){
  const lang = (settings && settings.language === "en") ? "en" : "it";
  const dict = {
    it: { undo: "Annulla", redo: "Ripeti", cut: "Taglia", copy: "Copia", paste: "Incolla", del: "Elimina", selectAll: "Seleziona tutto", copyLink: "Copia indirizzo link", copyImageAddr: "Copia indirizzo immagine", inspect: "Ispeziona elemento" },
    en: { undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", del: "Delete", selectAll: "Select all", copyLink: "Copy link address", copyImageAddr: "Copy image address", inspect: "Inspect element" },
  };
  return (dict[lang] && dict[lang][key]) || dict.it[key] || key;
}
function buildContextMenuTemplate(params){
  const f = params.editFlags || {};
  const tpl = [];
  if (params.isEditable) {
    if (f.canUndo) tpl.push({ label: tMenu("undo"), role: "undo" });
    if (f.canRedo) tpl.push({ label: tMenu("redo"), role: "redo" });
    if (f.canUndo || f.canRedo) tpl.push({ type: "separator" });
    if (f.canCut) tpl.push({ label: tMenu("cut"), role: "cut" });
    if (f.canCopy) tpl.push({ label: tMenu("copy"), role: "copy" });
    if (f.canPaste) tpl.push({ label: tMenu("paste"), role: "paste" });
    if (f.canDelete) tpl.push({ label: tMenu("del"), role: "delete" });
    if (f.canCut || f.canCopy || f.canPaste || f.canDelete) tpl.push({ type: "separator" });
    if (f.canSelectAll) tpl.push({ label: tMenu("selectAll"), role: "selectAll" });
  } else {
    if (params.linkURL) tpl.push({ label: tMenu("copyLink"), click: () => clipboard.writeText(params.linkURL) });
    if (params.srcURL && params.mediaType === "image") tpl.push({ label: tMenu("copyImageAddr"), click: () => clipboard.writeText(params.srcURL) });
    if (params.selectionText && params.selectionText.trim()) tpl.push({ label: tMenu("copy"), role: "copy" });
    // Always offer select all when there is selectable content, even if no selection yet
    const hasCopy = tpl.some((i) => i.role === "copy");
    if (hasCopy || params.linkURL || params.srcURL) tpl.push({ type: "separator" });
    tpl.push({ label: tMenu("selectAll"), role: "selectAll" });
    // Fallback: if nothing selectable (empty page), keep at least copy/paste disabled state hidden -> keep selectAll only
    if (tpl.length === 1 && tpl[0].role === "selectAll" && !params.selectionText) {
      // keep it, useful for chat history
    }
  }
  return tpl;
}
function attachContextMenu(browserWindow){
  const contents = browserWindow.webContents;
  contents.on("context-menu", (_event, params) => {
    const template = buildContextMenuTemplate(params);
    // Add Inspect in dev (or always, cheap)
    if (!app.isPackaged) {
      template.push({ type: "separator" });
      template.push({ label: tMenu("inspect"), click: () => contents.inspectElement(params.x, params.y) });
    }
    if (!template.length) return;
    try { Menu.buildFromTemplate(template).popup({ window: browserWindow }); } catch {}
  });
}
function attachNavigationPolicy(browserWindow){
  const contents=browserWindow.webContents;
  contents.setWindowOpenHandler(({url})=>{
    if(isAllowedExternalUrl(url)) shell.openExternal(url);
    else console.warn("[windowOpen] blocked:",String(url).slice(0,200));
    return {action:"deny"};
  });
  const blockNavigation=(event,url)=>{
    if(String(url).startsWith("file:")){
      try{
        const target=realPath(fileURLToPath(url));
        const rendererRoot=realPath(path.join(__dirname,"..","..","renderer"));
        if(target===rendererRoot || target.startsWith(rendererRoot+path.sep)) return;
      }catch{}
    }
    event.preventDefault();
    if(isAllowedExternalUrl(url)) shell.openExternal(url);
    else console.warn("[navigation] blocked:",String(url).slice(0,200));
  };
  contents.on("will-navigate",blockNavigation);
  contents.on("will-redirect",blockNavigation);
}
// Future windows (e.g. devtools popouts) get the same menu
app.on("browser-window-created", (_e, bw) => { try{ attachContextMenu(bw); }catch{} });

function realPath(value){
  const resolved=path.resolve(String(value||""));
  try{return fs.realpathSync.native(resolved);}catch{return resolved;}
}
function allowedProjectRoots(){
  return [...new Set([...(settings?.projects||[]),settings?.cwd].filter(Boolean).map(realPath))];
}
function isAllowedProjectPath(value){
  const target=realPath(value);
  return allowedProjectRoots().some((root)=>target===root || target.startsWith(root+path.sep));
}
handle("shell:openExternal", (_e, url) => {
  if (isAllowedExternalUrl(url)) shell.openExternal(url);
  else console.warn("[openExternal] blocked:", String(url).slice(0,200));
});
// Shell di login dell'utente: usata solo per il badge del terminale dockato.
handle("app:getShellInfo", () => {
  if (process.platform === "win32") return { shell: "cmd" };
  return { shell: path.basename(String(process.env.SHELL || "bash")) || "bash" };
});
handle("shell:openTerminal", (_e, requestedCwd) => {
  const cwd=realPath(requestedCwd || settings?.cwd);
  if(!isAllowedProjectPath(cwd) || !isDirectory(cwd)) throw new Error("Cartella terminale non valida");
  let command=""; let args=[];
  if(process.platform==="darwin"){ command="open"; args=["-a","Terminal",cwd]; }
  else if(process.platform==="win32"){ command="cmd.exe"; args=["/K"]; }
  else{
    const candidates=[
      ["/usr/bin/x-terminal-emulator",[]],
      ["/usr/bin/gnome-terminal",[`--working-directory=${cwd}`]],
      ["/usr/bin/konsole",["--workdir",cwd]],
      ["/usr/bin/xfce4-terminal",[`--working-directory=${cwd}`]],
      ["/usr/bin/kitty",["--directory",cwd]],
      ["/usr/bin/alacritty",["--working-directory",cwd]],
    ];
    const found=candidates.find(([bin])=>fs.existsSync(bin));
    if(!found) throw new Error("Nessun emulatore di terminale trovato");
    [command,args]=found;
  }
  const child=spawn(command,args,{cwd,detached:true,stdio:"ignore"});
  child.unref();
  return {ok:true};
});

handle("sessions:list", async () => {
  const now = Date.now();
  if (sessionsListCache && now - sessionsListCacheAt < SESSIONS_CACHE_TTL_MS) return sessionsListCache;
  const listed = (await sessionsAsync.listSessions(sessionsDir())).map((session) => ({
    ...session,
    preference: {
      ...(session.preference || {}),
      ...(settings.sessionPreferences?.[session.file] || {}),
    },
  }));
  sessionsListCache = listed;
  sessionsListCacheAt = now;
  return listed;
});

handle("sessions:preview", async (_e, file) => {
  const resolvedRoot = path.resolve(sessionsDir());
  const resolvedFile = path.resolve(file);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) || !resolvedFile.endsWith(".jsonl")) {
    throw new Error("Percorso sessione non valido");
  }
  return sanitizeMessagesForIpc(await sessionsAsync.readSessionMessages(resolvedFile));
});

// Endpoint paginato per la cronologia progressiva: restituisce gli ultimi N messaggi
// bypassando il limite di 100 del preview standard.
function resolveSessionFile(file) {
  const resolvedRoot = path.resolve(sessionsDir());
  const resolvedFile = path.resolve(file);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) || !resolvedFile.endsWith(".jsonl")) {
    throw new Error("Percorso sessione non valido");
  }
  return resolvedFile;
}

handle("sessions:messagesPage", async (_e, { file, limit = 2000 }) => {
  const resolvedFile = resolveSessionFile(file);
  return sanitizeMessagesForIpc(await sessionsAsync.readSessionMessages(resolvedFile), Math.min(limit, 3000), 2_000_000);
});

handle("sessions:messageCount", async (_e, { file }) => {
  const resolvedFile = resolveSessionFile(file);
  return { count: await sessionsAsync.countSessionMessages(resolvedFile) };
});

handle("sessions:messagesRange", async (_e, { file, start, end }) => {
  const resolvedFile = resolveSessionFile(file);
  const messages = await sessionsAsync.readSessionMessagesSlice(resolvedFile, start, end);
  return sanitizeMessagesForIpc({ messages }, messages.length, 2_000_000);
});

handle("sessions:delete", async (_e, file) => {
  // Safety: only delete inside our sessions dir.
  const resolvedRoot = path.resolve(sessionsDir());
  const resolvedFile = path.resolve(file);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) || !resolvedFile.endsWith(".jsonl")) {
    throw new Error("Percorso sessione non valido");
  }
  const openTab = runtime.list().find((tab) => tab.sessionFile === resolvedFile);
  if (openTab) runtime.close(openTab.id);
  await sessionsAsync.deleteSession(resolvedFile);
  sessionsListCache = null;
  sessionsListCacheAt = 0;
  if (settings.sessionPreferences) delete settings.sessionPreferences[resolvedFile];
  if (settings.sessionMeta) delete settings.sessionMeta[resolvedFile];
  saveSettings();
  return { ok: true };
});

handle("sessions:searchFullText", async (_e, query) => {
  if (typeof query === "string") {
    const q = query.trim();
    if (!q) return [];
    return sessionsAsync.searchSessionsFullText(sessionsDir(), q, 80);
  }
  if (!query || typeof query !== "object") return [];
  return sessionsAsync.searchSessionsFullText(sessionsDir(), query, 80);
});

handle("sessions:bulkDelete", async (_e, files) => {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) throw new Error("Nessuna sessione selezionata");
  const root = path.resolve(sessionsDir());
  const toDelete = list.filter((f) => String(f).startsWith(root + path.sep));
  for (const f of toDelete) {
    const openTab = runtime.list().find((tab) => tab.sessionFile === path.resolve(String(f)));
    if (openTab) runtime.close(openTab.id);
  }
  const result = await sessionsAsync.bulkDeleteSessions(toDelete, sessionsDir());
  sessionsListCache = null;
  sessionsListCacheAt = 0;
  for (const f of toDelete) {
    if (settings.sessionPreferences) delete settings.sessionPreferences[path.resolve(String(f))];
    if (settings.sessionMeta) delete settings.sessionMeta[path.resolve(String(f))];
  }
  saveSettings();
  return result;
});
handle("sessions:restoreTrash", async (_e, trashFile) => {
  const trashDir = sessionsStore.trashDirFor(sessionsDir());
  const src = path.join(trashDir, path.basename(String(trashFile)));
  if(!fs.existsSync(src)) throw new Error("File trash non trovato");
  const dest = sessionsStore.restoreFromTrash(sessionsDir(), src);
  sessionsListCache=null; sessionsListCacheAt=0;
  return { ok:true, restored: dest };
});
handle("sessions:listTrash", async () => {
  const trashDir = sessionsStore.trashDirFor(sessionsDir());
  try{
    const entries = fs.readdirSync(trashDir).filter(f=>f.endsWith(".jsonl")).map(f=>{
      const p=path.join(trashDir,f); const st=fs.statSync(p); return { file:f, path:p, mtime: st.mtimeMs, size: st.size };
    }).sort((a,b)=>b.mtime-a.mtime).slice(0,50);
    return entries;
  }catch{ return []; }
});

handle("sessions:setMeta", (_e, { file, patch }) => {
  const resolvedRoot = path.resolve(sessionsDir());
  const resolvedFile = file ? path.resolve(String(file)) : null;
  if (!resolvedFile || !resolvedFile.startsWith(resolvedRoot + path.sep)) throw new Error("Percorso non valido");
  if (!settings.sessionMeta) settings.sessionMeta = {};
  const current = settings.sessionMeta[resolvedFile] || {};
  const next = { ...current };
  if ("pinned" in (patch||{})) next.pinned = Boolean(patch.pinned);
  if ("favorite" in (patch||{})) next.favorite = Boolean(patch.favorite);
  if ("archived" in (patch||{})) next.archived = Boolean(patch.archived);
  if ("tags" in (patch||{})) {
    const tags = Array.isArray(patch.tags) ? patch.tags.map((t)=>String(t).trim().toLowerCase()).filter(Boolean).slice(0,8) : [];
    next.tags = [...new Set(tags)];
  }
  if (Object.keys(next).length === 0 || (!next.pinned && !next.favorite && !next.archived && (!next.tags||!next.tags.length))) {
    delete settings.sessionMeta[resolvedFile];
  } else {
    settings.sessionMeta[resolvedFile] = next;
  }
  saveSettings();
  return { ok: true, meta: settings.sessionMeta[resolvedFile] || null };
});

handle("sessions:getMeta", () => settings.sessionMeta || {});

handle("fs:listExplorer", async (_e, { cwd, depth, showDotfiles }) => {
  const target = cwd ? path.resolve(String(cwd)) : path.resolve(settings.cwd || app.getPath("home"));
  if (!isDirectory(target) || !isAllowedProjectPath(target)) throw new Error("Cartella non disponibile");
  return sessionsAsync.listExplorerTree(target, Math.min(Math.max(Number(depth)||2,1),4), 800, { showDotfiles: Boolean(showDotfiles) });
});

handle("fs:readTextFile", async (_e, filePath) => {
  const p = realPath(filePath);
  const cwd = realPath(settings.cwd || app.getPath("home"));
  if (!p.startsWith(cwd + path.sep) && p !== cwd) throw new Error("File fuori dal progetto");
  const st = fs.statSync(p);
  if (!st.isFile() || st.size > 512*1024) throw new Error("File troppo grande o non leggibile");
  return { content: fs.readFileSync(p, "utf8").slice(0, 20000), size: st.size };
});

handle("health:getPiLogs", () => {
  try { return { logs: (runtime.getRecentLogs && runtime.getRecentLogs()) || [] }; } catch { return { logs: [] }; }
});

handle("sessions:bulkExport", async (_e, files) => {
  const list = Array.isArray(files) ? files : [];
  const picked = [];
  const root = path.resolve(sessionsDir());
  for (const f of list) {
    try {
      const resolved = path.resolve(String(f));
      if(!resolved.startsWith(root + path.sep) || !resolved.endsWith(".jsonl")) continue;
      const msgs = await sessionsAsync.readSessionMessages(resolved);
      const session = await sessionsAsync.parseSessionFile(resolved);
      if (msgs.messages) picked.push({ file: resolved, session, count: msgs.messages.length, messages: msgs.messages });
    } catch {}
  }
  return { ok: true, items: picked };
});

// --- pi lifecycle -----------------------------------------------------------

handle("pi:start", async (_e, opts = {}) => {
  const saved = settings.lastModel || {};
  const result = await runtime.start({
    cwd: opts.cwd || settings.cwd,
    provider: opts.provider || saved.provider,
    model: opts.model || saved.modelId,
    persist: Boolean(opts.persist),
    sessionPath: opts.sessionPath || null,
    sessionDir: settings.sessionsDir ? sessionsDir() : undefined,
    name: opts.name,
    piPath: settings.piPath || undefined,
  });
  if (!opts.persist && settings.lastThinkingLevel) await runtime.setThinkingLevel(settings.lastThinkingLevel).catch(() => {});
  return result;
});

handle("pi:listTabs", () => runtime.list());
handle("pi:activateTab", (_e, tabId) => runtime.activate(tabId));
handle("pi:closeTab", (_e, tabId) => runtime.close(tabId));

async function checkBudgetForCwd(cwd, tabId){
  try{
    const b = settings?.budgets?.[cwd];
    if(!b || (b.maxCost==null && b.maxTokens==null)) return { ok:true };
    let sessions = (await sessionsAsync.listSessions(sessionsDir())).filter(s=>s.cwd===cwd);
    if(b.reset==="monthly"){
      const month = new Date().toISOString().slice(0,7);
      sessions = sessions.filter((session)=>String(session.timestamp || new Date(session.modified).toISOString()).slice(0,7)===month);
    } else if(b.reset==="session"){
      const activeFile = tabId ? runtime.list().find((tab)=>tab.id===tabId)?.sessionFile : null;
      sessions = activeFile ? sessions.filter((session)=>session.file===activeFile) : sessions.slice(0,1);
    }
    let cost=0, tokens=0;
    for(const s of sessions){ if(typeof s.cost==="number") cost+=s.cost; if(typeof s.tokens==="number") tokens+=s.tokens; else if(s.tokens && typeof s.tokens.total==="number") tokens+=s.tokens.total; }
    const costOver = b.maxCost!=null && cost >= b.maxCost;
    const tokOver = b.maxTokens!=null && tokens >= b.maxTokens;
    if(costOver || tokOver) return { ok:false, cost, tokens, budget:b };
    const costPct = b.maxCost ? cost/b.maxCost : 0;
    const tokPct = b.maxTokens ? tokens/b.maxTokens : 0;
    const pct = Math.max(costPct, tokPct);
    if(pct>=0.8) console.warn(`[budget] ${cwd} ${Math.round(pct*100)}%`);
    return { ok:true, cost, tokens, pct };
  }catch{ return { ok:true }; }
}
handle("pi:prompt", async (_e, { message, images, streamingBehavior, tabId }) => {
  const cwd = (tabId && runtime.list().find(t=>t.id===tabId)?.cwd) || settings?.cwd;
  const chk = await checkBudgetForCwd(cwd, tabId);
  if(!chk.ok) throw new Error(`Budget superato per ${cwd}: costo ${chk.cost?.toFixed?.(2)||chk.cost} / ${chk.budget.maxCost} o token ${chk.tokens} / ${chk.budget.maxTokens}. Aggiorna il budget in Impostazioni.`);
  await ensureRuntime();
  return runtime.prompt(message, images, streamingBehavior, tabId);
});
handle("pi:steer", async (_e, { message, images, tabId }) => {
  const cwd = (tabId && runtime.list().find(t=>t.id===tabId)?.cwd) || settings?.cwd;
  const chk = await checkBudgetForCwd(cwd, tabId);
  if(!chk.ok) throw new Error(`Budget superato per ${cwd}`);
  await ensureRuntime();
  return runtime.steer(message, images, tabId);
});
handle("pi:followUp", async (_e, { message, images, tabId }) => {
  const cwd = (tabId && runtime.list().find(t=>t.id===tabId)?.cwd) || settings?.cwd;
  const chk = await checkBudgetForCwd(cwd, tabId);
  if(!chk.ok) throw new Error(`Budget superato per ${cwd}`);
  await ensureRuntime();
  return runtime.followUp(message, images, tabId);
});
handle("pi:abort", (_e, tabId) => runtime.abort(tabId));
handle("pi:forceStop", () => runtime.forceStopAndRecover());
handle("pi:newSession", async (_e, { cwd, parentSession } = {}) => {
  const t0 = Date.now();
  try {
    return await runtime.newSession({
    cwd: cwd || settings.cwd,
    piPath: settings.piPath || undefined,
    provider: settings.lastModel?.provider,
    model: settings.lastModel?.modelId,
    thinkingLevel: settings.lastThinkingLevel,
      sessionDir: settings.sessionsDir ? sessionsDir() : undefined,
      parentSession,
    });
  } finally {
    const ms = Date.now() - t0;
    if (ms > 2000) console.warn(`[pi:newSession] lento: ${ms}ms (cwd=${cwd || settings.cwd})`);
    else console.log(`[pi:newSession] ${ms}ms`);
  }
});
handle("pi:openSession", async (_e, { sessionPath, cwd, preference, title }) => {
  const stored = settings.sessionPreferences?.[sessionPath];
  const selected = safePreference(preference || stored);
  const result = await runtime.openSession(sessionPath, {
    cwd,
    piPath: settings.piPath || undefined,
    provider: selected.provider,
    model: selected.modelId,
    thinkingLevel: selected.thinkingLevel,
    sessionDir: settings.sessionsDir ? sessionsDir() : undefined,
    title: typeof title === "string" ? title.slice(0, 120) : undefined,
  });
  // Preference persistence is secondary to click-to-chat latency.
  rememberCurrentPreference().catch(() => {});
  return { ok: true, tabId: result?.tabId, reused: Boolean(result?.reused) };
});
handle("pi:getState", async (_e, tabId) => {
  await ensureRuntime();
  const state = await runtime.getState(tabId);
  try {
    return ipcSanitize.sanitizeForIpc(state);
  } catch (err) {
    console.error("[getState] sanitize fallita:", err);
    return { tabId };
  }
});
handle("pi:getMessages", async (_e, tabId) => {
  await ensureRuntime();
  const payload = await runtime.getMessages(tabId);
  try {
    return ipcSanitize.sanitizeMessagesPayload(payload);
  } catch (err) {
    console.error("[getMessages] sanitize fallita:", err);
    return { messages: [], truncated: false, hiddenCount: 0, loadError: "sanitize_failed" };
  }
});
handle("pi:getAvailableModels", async () => {
  await ensureRuntime();
  // Il catalogo modelli vive nel processo pi avviato: se pi e' stato aggiornato
  // a app aperta, riavvia il runtime (a streaming fermo) prima di rispondere,
  // altrimenti il menu modelli mostra per sempre il catalogo della vecchia versione.
  if (!runtime.isBusy() && (await runtime.piBinaryChanged().catch(() => false))) {
    console.log("[runtime] binario pi aggiornato: riavvio del runtime per aggiornare il catalogo modelli");
    await runtime.restart().catch(() => {});
  }
  const data = await runtime.getAvailableModels();
  // ponytail: live opencode fallback - se pi.dev è stale, sintetizza modelli mancanti da API diretta
  try {
    const auth = providerStore.readAuth();
    const liveProviders = [
      { id: "opencode", url: "https://opencode.ai/zen/v1/models" },
      { id: "opencode-go", url: "https://opencode.ai/zen/go/v1/models" },
    ];
    const existing = new Set((data.models || []).map((m) => `${m.provider}/${m.id}`));
    for (const { id, url } of liveProviders) {
      const key = auth[id]?.key;
      if (!key) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      let liveIds = null;
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
        if (res.ok) {
          const j = await res.json();
          liveIds = (j.data || []).map((m) => m.id).filter(Boolean);
        }
      } catch {}
      clearTimeout(timer);
      if (!liveIds || !liveIds.length) continue;
      for (const modelId of liveIds) {
        const k = `${id}/${modelId}`;
        if (existing.has(k)) continue;
        const isGoAnthropic = id === "opencode-go" && (modelId.startsWith("minimax-") || modelId.startsWith("qwen") || modelId.startsWith("muse-") || modelId.startsWith("hy"));
        const api = isGoAnthropic ? "anthropic-messages" : "openai-completions";
        const baseUrl = id === "opencode-go" ? (api === "anthropic-messages" ? "https://opencode.ai/zen/go" : "https://opencode.ai/zen/go/v1") : "https://opencode.ai/zen/v1";
        data.models.push({
          id: modelId,
          name: modelId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          api,
          provider: id,
          baseUrl,
          reasoning: true,
          input: api === "anthropic-messages" ? ["text", "image"] : ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 131072,
          maxTokens: 8192,
        });
        existing.add(k);
      }
    }
  } catch {}
  return data;
});
handle("pi:setModel", async (_e, { provider, modelId }) => {
  await ensureRuntime();
  const result = await runtime.setModel(provider, modelId);
  await rememberCurrentPreference();
  return result;
});
handle("pi:setThinkingLevel", async (_e, { level }) => {
  await ensureRuntime();
  const result = await runtime.setThinkingLevel(level);
  await rememberCurrentPreference();
  return result;
});
handle("pi:getThinkingLevels", async () => {
  await ensureRuntime();
  return runtime.getThinkingLevels();
});
handle("pi:getStats", async () => {
  await ensureRuntime();
  return runtime.getSessionStats();
});
handle("pi:getCommands", async () => {
  await ensureRuntime();
  return runtime.getCommands();
});
handle("pi:getTree", async () => {
  await ensureRuntime();
  return runtime.getTree();
});
handle("pi:getEntries", async (_e, since) => {
  await ensureRuntime();
  return runtime.getEntries(typeof since === "string" ? since : undefined);
});
handle("pi:getForkMessages", async () => {
  await ensureRuntime();
  return runtime.getForkMessages();
});
handle("pi:fork", async (_e, entryId) => {
  if (typeof entryId !== "string" || !entryId) throw new Error("Messaggio di fork non valido");
  await ensureRuntime();
  const result = await runtime.fork(entryId);
  await rememberCurrentPreference();
  return result;
});
handle("pi:clone", async () => {
  await ensureRuntime();
  const result = await runtime.clone();
  await rememberCurrentPreference();
  return result;
});
handle("pi:getLastAssistantText", async () => {
  await ensureRuntime();
  return runtime.getLastAssistantText();
});
handle("pi:setSessionName", async (_e, name) => {
  if (typeof name !== "string" || name.length > 200) throw new Error("Nome sessione non valido");
  await ensureRuntime();
  const result = await runtime.setSessionName(name.trim());
  return result;
});
handle("pi:compact", async (_e, customInstructions) => {
  await ensureRuntime();
  return runtime.compact(typeof customInstructions === "string" ? customInstructions.trim() : undefined);
});
handle("pi:setAutoCompaction", async (_e, enabled) => {
  await ensureRuntime();
  return runtime.setAutoCompaction(Boolean(enabled));
});
handle("pi:setAutoRetry", async (_e, enabled) => {
  await ensureRuntime();
  return runtime.setAutoRetry(Boolean(enabled));
});
handle("pi:abortRetry", async () => {
  await ensureRuntime();
  return runtime.abortRetry();
});
handle("pi:setSteeringMode", async (_e, mode) => {
  if (!["all", "one-at-a-time"].includes(mode)) throw new Error("Modalità steer non valida");
  await ensureRuntime();
  return runtime.setSteeringMode(mode);
});
handle("pi:setFollowUpMode", async (_e, mode) => {
  if (!["all", "one-at-a-time"].includes(mode)) throw new Error("Modalità follow-up non valida");
  await ensureRuntime();
  return runtime.setFollowUpMode(mode);
});
handle("pi:exportHtml", async (_e, outputPath) => {
  await ensureRuntime();
  let selected = outputPath;
  if (!selected) {
    const result = await dialog.showSaveDialog(win, {
      title: "Esporta sessione Pi",
      defaultPath: `pi-session-${new Date().toISOString().slice(0, 10)}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (result.canceled) return { cancelled: true };
    selected = result.filePath;
  }
  return runtime.exportHtml(selected);
});
handle("pi:bash", async (_e, { command, excludeFromContext } = {}) => {
  if (typeof command !== "string" || !command.trim()) throw new Error("Comando shell vuoto");
  await ensureRuntime();
  return runtime.bash(command.trim(), Boolean(excludeFromContext));
});
handle("pi:abortBash", async () => {
  await ensureRuntime();
  return runtime.abortBash();
});

// Extension UI dialogs (select/confirm/input/editor) answered by the renderer.
handle("pi:uiRespond", (_e, { id, payload }) => runtime.uiRespond(id, payload));

// --- native pi settings and project trust ---------------------------------

handle("piSettings:get", () => piSettingsStore.get(settings.cwd));

handle("piSettings:set", async (_e, patch) => {
  const result = piSettingsStore.setGlobal(settings.cwd, patch || {});
  await runtime.restart().catch(() => runtime.stop());
  return result;
});

handle("piSettings:setTrust", async (_e, decision) => {
  if (![true, false, null].includes(decision)) throw new Error("Decisione di trust non valida");
  const result = piSettingsStore.setTrust(settings.cwd, decision);
  await runtime.restart().catch(() => runtime.stop());
  return result;
});

handle("piSettings:save", async (_e, { patch, trustDecision } = {}) => {
  if (![true, false, null].includes(trustDecision)) throw new Error("Decisione di trust non valida");
  piSettingsStore.setGlobal(settings.cwd, patch || {});
  piSettingsStore.setTrust(settings.cwd, trustDecision);
  await runtime.restart().catch(() => runtime.stop());
  return piSettingsStore.get(settings.cwd);
});

// --- provider credentials (shared with the external pi installation) -------

handle("providers:list", () => listProviderSettings());

handle("providers:setKey", async (_e, { providerId, key }) => {
  providerStore.setApiKey(providerId, key);
  await runtime.restart().catch(() => runtime.stop());
  return listProviderSettings();
});

handle("providers:remove", async (_e, providerId) => {
  await authService.logout(settings, providerId).catch(() => providerStore.removeCredential(providerId));
  await runtime.restart().catch(() => runtime.stop());
  return listProviderSettings();
});

handle("providers:login", async (_e, { providerId, authType }) => {
  if (typeof providerId !== "string" || !providerId) throw new Error("Provider non valido");
  if (!["api_key", "oauth"].includes(authType)) throw new Error("Tipo di autenticazione non valido");
  const controller = new AbortController();
  authControllers.get(providerId)?.abort();
  authControllers.set(providerId, controller);
  sendAuthEvent({ kind: "start", providerId, authType });
  try {
    await authService.login(settings, providerId, authType, {
      signal: controller.signal,
      prompt: (prompt) => requestAuthPrompt(providerId, prompt, prompt.signal || controller.signal),
      notify: (event) => {
        if (event.type === "auth_url" && isAllowedExternalUrl(event.url || "")) shell.openExternal(event.url);
        if (event.type === "device_code" && isAllowedExternalUrl(event.verificationUri || "")) shell.openExternal(event.verificationUri);
        sendAuthEvent({ kind: "event", providerId, event });
      },
    });
    await runtime.restart().catch(() => runtime.stop());
    sendAuthEvent({ kind: "complete", providerId });
    return listProviderSettings();
  } catch (err) {
    sendAuthEvent({ kind: "error", providerId, error: err.message });
    throw err;
  } finally {
    authControllers.delete(providerId);
  }
});

handle("providers:authRespond", (_e, { id, value, cancelled } = {}) => {
  const pending = pendingAuthRequests.get(id);
  if (!pending) return { ok: false };
  pendingAuthRequests.delete(id);
  if (cancelled) pending.reject(new Error("Login annullato"));
  else pending.resolve(String(value ?? ""));
  return { ok: true };
});

handle("providers:cancelLogin", (_e, providerId) => {
  authControllers.get(providerId)?.abort();
  return { ok: true };
});

// --- pi package store ------------------------------------------------------

handle("packages:search", (_e, query) => packageStore.searchPackages(query));
handle("packages:listInstalled", () => packageStore.listInstalled(settings));
handle("packages:listResources", () => packageResources.listResources(settings));
handle("packages:setResourceEnabled", async (_e, { resource, enabled } = {}) => {
  const result = packageResources.setResourceEnabled(settings, resource, Boolean(enabled));
  await runtime.restart().catch(() => runtime.stop());
  return result;
});

handle("packages:install", async (_e, { name, scope } = {}) => {
  const installed = await packageStore.install(name, settings, (line) => {
    sendToUi("pi:package-output", line);
  }, scope);
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

handle("packages:remove", async (_e, { name, scope } = {}) => {
  const installed = await packageStore.remove(name, settings, (line) => {
    sendToUi("pi:package-output", line);
  }, scope);
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

handle("packages:installSource", async (_e, { source, scope } = {}) => {
  const installed = await packageStore.installSource(source, scope, settings, (line) => {
    sendToUi("pi:package-output", line);
  });
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

handle("packages:removeSource", async (_e, { source, scope } = {}) => {
  const installed = await packageStore.removeSource(source, scope, settings, (line) => {
    sendToUi("pi:package-output", line);
  });
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

handle("packages:update", async (_e, target) => {
  const installed = await packageStore.update(target, settings, (line) => {
    sendToUi("pi:package-output", line);
  });
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

// --- app OTA (electron-updater, GitHub Releases) ----------------------------

handle("update:getState", () => (appUpdateService ? appUpdateService.getState() : { status: "disabled", currentVersion: app.getVersion(), availableVersion: null, progress: 0, error: null, autoInstall: true, cachedInstall: false, packageType: "", pendingPackagePath: null }));
handle("update:check", async () => (appUpdateService ? appUpdateService.check(true) : { success: false, error: "Updater not initialized" }));
handle("update:download", async () => (appUpdateService ? appUpdateService.download() : { success: false, error: "Updater not initialized" }));
handle("update:install", async () => (appUpdateService ? appUpdateService.install() : { success: false, error: "Updater not initialized" }));
handle("app:relaunch", () => {
  relaunchInstalledApp();
  return { success: true };
});

// --- pi CLI updates (independent of the app) --------------------------------

handle("pi:updateStatus", () => updater.status(settings));

handle("pi:maintenance", async (_e, kind) => {
  if (!["update", "install"].includes(kind)) throw new Error("Operazione non valida");
  const result = await updater.runMaintenance(kind, settings, (line) => {
    sendToUi("pi:maintenance-output", line);
  });
  return result;
});
