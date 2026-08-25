"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, globalShortcut, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
// execFile moved to mention-service.js

const { RuntimeTabs } = require("./runtime-tabs");
const sessionsStore = require("../services/sessions");
const updater = require("../updates/updater");
const providerStore = require("../services/provider-store");
const packageStore = require("../services/package-store");
const packageResources = require("../services/package-resource-service");
const piSettingsStore = require("../services/pi-settings-store");
const authService = require("../services/auth-service");
const { createMentionService } = require("../services/mention-service");
const { UpdateService } = require("../updates/update-service");

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

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  const defaults = {
    cwd: app.getPath("home"),
    projects: [app.getPath("home")],
    piPath: "",
    sessionsDir: "",
    sidebarVisible: true,
    language: "it",
    lastModel: null,
    lastThinkingLevel: null,
    sessionPreferences: {},
  };
  try {
    const loaded = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) };
    const projects = Array.isArray(loaded.projects) ? loaded.projects : [loaded.cwd];
    loaded.projects = [...new Set([loaded.cwd, ...projects].filter((value) => typeof value === "string" && value.trim()))];
    loaded.sessionPreferences = loaded.sessionPreferences && typeof loaded.sessionPreferences === "object" ? loaded.sessionPreferences : {};
    return loaded;
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch {}
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

async function listProviderSettings() {
  const nativeProviders = await authService.listProviders(settings).catch(() => null);
  return providerStore.listProviders(undefined, nativeProviders);
}

function sendAuthEvent(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("pi:auth-request", payload);
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
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Mostra Pi Desktop", click: () => showWindow() },
    { label: "Nuova chat", click: () => { showWindow(); if (win && !win.isDestroyed()) win.webContents.send("pi:tray-new-chat"); } },
    { type: "separator" },
    { label: "Esci", role: "quit" },
  ]);
}

function createTray() {
  if (tray) return tray;
  try {
    const iconPath = resolveWindowIcon();
    if (!iconPath) return null;
    const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(image);
    tray.setToolTip("Pi Desktop");
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => showWindow());
    return tray;
  } catch (err) {
    console.warn("[tray] creazione fallita:", err.message);
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
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  if (!appUpdateService) {
    appUpdateService = new UpdateService(win);
  } else {
    appUpdateService.setWindow(win);
  }
  appUpdateService.initialize();
}

// Single instance lock.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(() => {
    settings = loadSettings();
    createWindow();
    try { createTray(); } catch {}
    try { registerGlobalShortcut(); } catch {}
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    // Warm start: pre-spawn an ephemeral pi process so the first "nuova chat"
    // appears instantly instead of waiting for a cold spawn.
    ensureRuntime().catch((err) => console.warn("[warm-start] fallito:", err.message));
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

app.on("will-quit", () => {
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
    };
  } catch {}
}

const runtime = new RuntimeTabs((channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
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
  } catch {}
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle("settings:get", () => publicSettings());

ipcMain.handle("settings:set", async (_e, patch) => {
  const allowed = ["cwd", "piPath", "sessionsDir", "sidebarVisible", "lastModel", "language"];
  const previousCwd = settings.cwd;
  const previousPiPath = settings.piPath;
  const previousSessionsDir = settings.sessionsDir;
  for (const k of allowed) {
    if (!(k in patch)) continue;
    if (k === "cwd") settings[k] = resolveProjectPath(patch[k]);
    else if (k === "language") {
      const v = String(patch[k] || "").toLowerCase();
      if (v === "it" || v === "en") settings[k] = v;
    } else settings[k] = patch[k];
  }
  if ("cwd" in patch) settings.projects = [...new Set([...(settings.projects || []), settings.cwd])];
  saveSettings();
  if (previousCwd !== settings.cwd) {
    runtime.stop();
  } else if (previousPiPath !== settings.piPath || previousSessionsDir !== settings.sessionsDir) {
    await runtime.restart({ piPath: settings.piPath || undefined }).catch(() => runtime.stop());
  }
  return publicSettings();
});

ipcMain.handle("dialog:pickDirectory", async (_e, title) => {
  const res = await dialog.showOpenDialog(win, { title: title || "Scegli cartella", properties: ["openDirectory"] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle("dialog:pickFiles", async (_e, kind = "files") => {
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

ipcMain.handle("fs:searchFiles", (_e, query) => searchMentionCandidates(query));

// Drag&drop: lista file dentro una cartella droppata (relativi alla cartella stessa)
ipcMain.handle("fs:listDropped", async (_e, absPath) => {
  try {
    const p = String(absPath || "").trim();
    if (!p) return [];
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

ipcMain.handle("projects:add", async () => {
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

ipcMain.handle("projects:activate", (_e, projectPath) => {
  const resolved = resolveProjectPath(projectPath);
  const alreadyListed = (settings.projects || []).includes(resolved);
  if (settings.cwd === resolved && alreadyListed) return publicSettings();
  settings.projects = [...new Set([...(settings.projects || []), resolved])];
  settings.cwd = resolved;
  saveSettings();
  return publicSettings();
});

ipcMain.handle("projects:remove", (_e, projectPath) => {
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

ipcMain.handle("shell:openExternal", (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle("sessions:list", () => {
  const now = Date.now();
  if (sessionsListCache && now - sessionsListCacheAt < SESSIONS_CACHE_TTL_MS) return sessionsListCache;
  const listed = sessionsStore.listSessions(sessionsDir()).map((session) => ({
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

ipcMain.handle("sessions:delete", async (_e, file) => {
  // Safety: only delete inside our sessions dir.
  const resolvedRoot = path.resolve(sessionsDir());
  const resolvedFile = path.resolve(file);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) || !resolvedFile.endsWith(".jsonl")) {
    throw new Error("Percorso sessione non valido");
  }
  const openTab = runtime.list().find((tab) => tab.sessionFile === resolvedFile);
  if (openTab) runtime.close(openTab.id);
  sessionsStore.deleteSession(resolvedFile);
  sessionsListCache = null;
  sessionsListCacheAt = 0;
  if (settings.sessionPreferences) delete settings.sessionPreferences[resolvedFile];
  saveSettings();
  return { ok: true };
});

// --- pi lifecycle -----------------------------------------------------------

ipcMain.handle("pi:start", async (_e, opts = {}) => {
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

ipcMain.handle("pi:listTabs", () => runtime.list());
ipcMain.handle("pi:activateTab", (_e, tabId) => runtime.activate(tabId));
ipcMain.handle("pi:closeTab", (_e, tabId) => runtime.close(tabId));

ipcMain.handle("pi:prompt", async (_e, { message, images, streamingBehavior, tabId }) => {
  await ensureRuntime();
  return runtime.prompt(message, images, streamingBehavior, tabId);
});
ipcMain.handle("pi:steer", async (_e, { message, images, tabId }) => {
  await ensureRuntime();
  return runtime.steer(message, images, tabId);
});
ipcMain.handle("pi:followUp", async (_e, { message, images, tabId }) => {
  await ensureRuntime();
  return runtime.followUp(message, images, tabId);
});
ipcMain.handle("pi:abort", (_e, tabId) => runtime.abort(tabId));
ipcMain.handle("pi:forceStop", () => runtime.forceStopAndRecover());
ipcMain.handle("pi:newSession", async (_e, { cwd, parentSession } = {}) => {
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
ipcMain.handle("pi:openSession", async (_e, { sessionPath, cwd, preference, title }) => {
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
  return result;
});
ipcMain.handle("pi:getState", async (_e, tabId) => {
  await ensureRuntime();
  return runtime.getState(tabId);
});
ipcMain.handle("pi:getMessages", async (_e, tabId) => {
  await ensureRuntime();
  return runtime.getMessages(tabId);
});
ipcMain.handle("pi:getAvailableModels", async () => {
  await ensureRuntime();
  return runtime.getAvailableModels();
});
ipcMain.handle("pi:setModel", async (_e, { provider, modelId }) => {
  await ensureRuntime();
  const result = await runtime.setModel(provider, modelId);
  await rememberCurrentPreference();
  return result;
});
ipcMain.handle("pi:setThinkingLevel", async (_e, { level }) => {
  await ensureRuntime();
  const result = await runtime.setThinkingLevel(level);
  await rememberCurrentPreference();
  return result;
});
ipcMain.handle("pi:getThinkingLevels", async () => {
  await ensureRuntime();
  return runtime.getThinkingLevels();
});
ipcMain.handle("pi:getStats", async () => {
  await ensureRuntime();
  return runtime.getSessionStats();
});
ipcMain.handle("pi:getCommands", async () => {
  await ensureRuntime();
  return runtime.getCommands();
});
ipcMain.handle("pi:getTree", async () => {
  await ensureRuntime();
  return runtime.getTree();
});
ipcMain.handle("pi:getEntries", async (_e, since) => {
  await ensureRuntime();
  return runtime.getEntries(typeof since === "string" ? since : undefined);
});
ipcMain.handle("pi:getForkMessages", async () => {
  await ensureRuntime();
  return runtime.getForkMessages();
});
ipcMain.handle("pi:fork", async (_e, entryId) => {
  if (typeof entryId !== "string" || !entryId) throw new Error("Messaggio di fork non valido");
  await ensureRuntime();
  const result = await runtime.fork(entryId);
  await rememberCurrentPreference();
  return result;
});
ipcMain.handle("pi:clone", async () => {
  await ensureRuntime();
  const result = await runtime.clone();
  await rememberCurrentPreference();
  return result;
});
ipcMain.handle("pi:getLastAssistantText", async () => {
  await ensureRuntime();
  return runtime.getLastAssistantText();
});
ipcMain.handle("pi:setSessionName", async (_e, name) => {
  if (typeof name !== "string" || name.length > 200) throw new Error("Nome sessione non valido");
  await ensureRuntime();
  const result = await runtime.setSessionName(name.trim());
  return result;
});
ipcMain.handle("pi:compact", async (_e, customInstructions) => {
  await ensureRuntime();
  return runtime.compact(typeof customInstructions === "string" ? customInstructions.trim() : undefined);
});
ipcMain.handle("pi:setAutoCompaction", async (_e, enabled) => {
  await ensureRuntime();
  return runtime.setAutoCompaction(Boolean(enabled));
});
ipcMain.handle("pi:setAutoRetry", async (_e, enabled) => {
  await ensureRuntime();
  return runtime.setAutoRetry(Boolean(enabled));
});
ipcMain.handle("pi:abortRetry", async () => {
  await ensureRuntime();
  return runtime.abortRetry();
});
ipcMain.handle("pi:setSteeringMode", async (_e, mode) => {
  if (!["all", "one-at-a-time"].includes(mode)) throw new Error("Modalità steer non valida");
  await ensureRuntime();
  return runtime.setSteeringMode(mode);
});
ipcMain.handle("pi:setFollowUpMode", async (_e, mode) => {
  if (!["all", "one-at-a-time"].includes(mode)) throw new Error("Modalità follow-up non valida");
  await ensureRuntime();
  return runtime.setFollowUpMode(mode);
});
ipcMain.handle("pi:exportHtml", async (_e, outputPath) => {
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
ipcMain.handle("pi:bash", async (_e, { command, excludeFromContext } = {}) => {
  if (typeof command !== "string" || !command.trim()) throw new Error("Comando shell vuoto");
  await ensureRuntime();
  return runtime.bash(command.trim(), Boolean(excludeFromContext));
});
ipcMain.handle("pi:abortBash", async () => {
  await ensureRuntime();
  return runtime.abortBash();
});

// Extension UI dialogs (select/confirm/input/editor) answered by the renderer.
ipcMain.handle("pi:uiRespond", (_e, { id, payload }) => runtime.uiRespond(id, payload));

// --- native pi settings and project trust ---------------------------------

ipcMain.handle("piSettings:get", () => piSettingsStore.get(settings.cwd));

ipcMain.handle("piSettings:set", async (_e, patch) => {
  const result = piSettingsStore.setGlobal(settings.cwd, patch || {});
  await runtime.restart().catch(() => runtime.stop());
  return result;
});

ipcMain.handle("piSettings:setTrust", async (_e, decision) => {
  if (![true, false, null].includes(decision)) throw new Error("Decisione di trust non valida");
  const result = piSettingsStore.setTrust(settings.cwd, decision);
  await runtime.restart().catch(() => runtime.stop());
  return result;
});

ipcMain.handle("piSettings:save", async (_e, { patch, trustDecision } = {}) => {
  if (![true, false, null].includes(trustDecision)) throw new Error("Decisione di trust non valida");
  piSettingsStore.setGlobal(settings.cwd, patch || {});
  piSettingsStore.setTrust(settings.cwd, trustDecision);
  await runtime.restart().catch(() => runtime.stop());
  return piSettingsStore.get(settings.cwd);
});

// --- provider credentials (shared with the external pi installation) -------

ipcMain.handle("providers:list", () => listProviderSettings());

ipcMain.handle("providers:setKey", async (_e, { providerId, key }) => {
  providerStore.setApiKey(providerId, key);
  await runtime.restart().catch(() => runtime.stop());
  return listProviderSettings();
});

ipcMain.handle("providers:remove", async (_e, providerId) => {
  await authService.logout(settings, providerId).catch(() => providerStore.removeCredential(providerId));
  await runtime.restart().catch(() => runtime.stop());
  return listProviderSettings();
});

ipcMain.handle("providers:login", async (_e, { providerId, authType }) => {
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
        if (event.type === "auth_url" && /^https?:\/\//i.test(event.url || "")) shell.openExternal(event.url);
        if (event.type === "device_code" && /^https?:\/\//i.test(event.verificationUri || "")) shell.openExternal(event.verificationUri);
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

ipcMain.handle("providers:authRespond", (_e, { id, value, cancelled } = {}) => {
  const pending = pendingAuthRequests.get(id);
  if (!pending) return { ok: false };
  pendingAuthRequests.delete(id);
  if (cancelled) pending.reject(new Error("Login annullato"));
  else pending.resolve(String(value ?? ""));
  return { ok: true };
});

ipcMain.handle("providers:cancelLogin", (_e, providerId) => {
  authControllers.get(providerId)?.abort();
  return { ok: true };
});

// --- pi package store ------------------------------------------------------

ipcMain.handle("packages:search", (_e, query) => packageStore.searchPackages(query));
ipcMain.handle("packages:listInstalled", () => packageStore.listInstalled(settings));
ipcMain.handle("packages:listResources", () => packageResources.listResources(settings));
ipcMain.handle("packages:setResourceEnabled", async (_e, { resource, enabled } = {}) => {
  const result = packageResources.setResourceEnabled(settings, resource, Boolean(enabled));
  await runtime.restart().catch(() => runtime.stop());
  return result;
});

ipcMain.handle("packages:install", async (_e, { name, scope } = {}) => {
  const installed = await packageStore.install(name, settings, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send("pi:package-output", line);
  }, scope);
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

ipcMain.handle("packages:remove", async (_e, { name, scope } = {}) => {
  const installed = await packageStore.remove(name, settings, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send("pi:package-output", line);
  }, scope);
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

ipcMain.handle("packages:installSource", async (_e, { source, scope } = {}) => {
  const installed = await packageStore.installSource(source, scope, settings, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send("pi:package-output", line);
  });
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

ipcMain.handle("packages:removeSource", async (_e, { source, scope } = {}) => {
  const installed = await packageStore.removeSource(source, scope, settings, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send("pi:package-output", line);
  });
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

ipcMain.handle("packages:update", async (_e, target) => {
  const installed = await packageStore.update(target, settings, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send("pi:package-output", line);
  });
  await runtime.restart().catch(() => runtime.stop());
  return installed;
});

// --- app OTA (electron-updater, GitHub Releases) ----------------------------

ipcMain.handle("update:getState", () => (appUpdateService ? appUpdateService.getState() : { status: "disabled", currentVersion: app.getVersion(), availableVersion: null, progress: 0, error: null }));
ipcMain.handle("update:check", async () => (appUpdateService ? appUpdateService.check(true) : { success: false, error: "Updater not initialized" }));
ipcMain.handle("update:download", async () => (appUpdateService ? appUpdateService.download() : { success: false, error: "Updater not initialized" }));
ipcMain.handle("update:install", () => (appUpdateService ? appUpdateService.install() : { success: false, error: "Updater not initialized" }));

// --- pi CLI updates (independent of the app) --------------------------------

ipcMain.handle("pi:updateStatus", () => updater.status(settings));

ipcMain.handle("pi:maintenance", async (_e, kind) => {
  if (!["update", "install"].includes(kind)) throw new Error("Operazione non valida");
  const result = await updater.runMaintenance(kind, settings, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send("pi:maintenance-output", line);
  });
  return result;
});
