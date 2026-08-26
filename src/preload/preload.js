"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

contextBridge.exposeInMainWorld("piDesktop", {
  // settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  pickDirectory: (title) => ipcRenderer.invoke("dialog:pickDirectory", title),
  pickFiles: (kind) => ipcRenderer.invoke("dialog:pickFiles", kind),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  searchFiles: (query) => ipcRenderer.invoke("fs:searchFiles", query),
  listDroppedFiles: (absPath) => ipcRenderer.invoke("fs:listDropped", absPath),
  addProject: () => ipcRenderer.invoke("projects:add"),
  activateProject: (projectPath) => ipcRenderer.invoke("projects:activate", projectPath),
  removeProject: (projectPath) => ipcRenderer.invoke("projects:remove", projectPath),

  // history
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  previewSession: (file) => ipcRenderer.invoke("sessions:preview", file),
  deleteSession: (file) => ipcRenderer.invoke("sessions:delete", file),

  // agent lifecycle & commands
  start: (opts) => ipcRenderer.invoke("pi:start", opts),
  listTabs: () => ipcRenderer.invoke("pi:listTabs"),
  activateTab: (tabId) => ipcRenderer.invoke("pi:activateTab", tabId),
  closeTab: (tabId) => ipcRenderer.invoke("pi:closeTab", tabId),
  prompt: (message, images, streamingBehavior, tabId) =>
    ipcRenderer.invoke("pi:prompt", { message, images, streamingBehavior, tabId }),
  steer: (message, images, tabId) => ipcRenderer.invoke("pi:steer", { message, images, tabId }),
  followUp: (message, images, tabId) => ipcRenderer.invoke("pi:followUp", { message, images, tabId }),
  abort: (tabId) => ipcRenderer.invoke("pi:abort", tabId),
  forceStop: () => ipcRenderer.invoke("pi:forceStop"),
  newSession: (cwd, parentSession) => ipcRenderer.invoke("pi:newSession", { cwd, parentSession }),
  openSession: (sessionPath, cwd, preference, title) => ipcRenderer.invoke("pi:openSession", { sessionPath, cwd, preference, title }),
  getState: (tabId) => ipcRenderer.invoke("pi:getState", tabId),
  getMessages: (tabId) => ipcRenderer.invoke("pi:getMessages", tabId),
  getAvailableModels: () => ipcRenderer.invoke("pi:getAvailableModels"),
  setModel: (provider, modelId) => ipcRenderer.invoke("pi:setModel", { provider, modelId }),
  setThinkingLevel: (level) => ipcRenderer.invoke("pi:setThinkingLevel", { level }),
  getThinkingLevels: () => ipcRenderer.invoke("pi:getThinkingLevels"),
  getStats: () => ipcRenderer.invoke("pi:getStats"),
  getCommands: () => ipcRenderer.invoke("pi:getCommands"),
  getTree: () => ipcRenderer.invoke("pi:getTree"),
  getEntries: (since) => ipcRenderer.invoke("pi:getEntries", since),
  getForkMessages: () => ipcRenderer.invoke("pi:getForkMessages"),
  fork: (entryId) => ipcRenderer.invoke("pi:fork", entryId),
  clone: () => ipcRenderer.invoke("pi:clone"),
  getLastAssistantText: () => ipcRenderer.invoke("pi:getLastAssistantText"),
  setSessionName: (name) => ipcRenderer.invoke("pi:setSessionName", name),
  compact: (customInstructions) => ipcRenderer.invoke("pi:compact", customInstructions),
  setAutoCompaction: (enabled) => ipcRenderer.invoke("pi:setAutoCompaction", enabled),
  setAutoRetry: (enabled) => ipcRenderer.invoke("pi:setAutoRetry", enabled),
  abortRetry: () => ipcRenderer.invoke("pi:abortRetry"),
  setSteeringMode: (mode) => ipcRenderer.invoke("pi:setSteeringMode", mode),
  setFollowUpMode: (mode) => ipcRenderer.invoke("pi:setFollowUpMode", mode),
  exportHtml: (outputPath) => ipcRenderer.invoke("pi:exportHtml", outputPath),
  bash: (command, excludeFromContext) => ipcRenderer.invoke("pi:bash", { command, excludeFromContext }),
  abortBash: () => ipcRenderer.invoke("pi:abortBash"),
  uiRespond: (id, payload) => ipcRenderer.invoke("pi:uiRespond", { id, payload }),
  getPiSettings: () => ipcRenderer.invoke("piSettings:get"),
  setPiSettings: (patch) => ipcRenderer.invoke("piSettings:set", patch),
  setProjectTrust: (decision) => ipcRenderer.invoke("piSettings:setTrust", decision),
  savePiSettings: (patch, trustDecision) => ipcRenderer.invoke("piSettings:save", { patch, trustDecision }),

  // app OTA (electron-updater)
  getAppUpdateState: () => ipcRenderer.invoke("update:getState"),
  checkAppUpdate: () => ipcRenderer.invoke("update:check"),
  downloadAppUpdate: () => ipcRenderer.invoke("update:download"),
  installAppUpdate: () => ipcRenderer.invoke("update:install"),
  // pi CLI updates
  updateStatus: () => ipcRenderer.invoke("pi:updateStatus"),
  maintenance: (kind) => ipcRenderer.invoke("pi:maintenance", kind),

  // provider credentials shared with ~/.pi/agent/auth.json
  listProviders: () => ipcRenderer.invoke("providers:list"),
  setProviderKey: (providerId, key) => ipcRenderer.invoke("providers:setKey", { providerId, key }),
  removeProvider: (providerId) => ipcRenderer.invoke("providers:remove", providerId),
  loginProvider: (providerId, authType) => ipcRenderer.invoke("providers:login", { providerId, authType }),
  authRespond: (id, value, cancelled) => ipcRenderer.invoke("providers:authRespond", { id, value, cancelled }),
  cancelProviderLogin: (providerId) => ipcRenderer.invoke("providers:cancelLogin", providerId),

  getGitStatus: (cwd) => ipcRenderer.invoke("git:getStatus", cwd),
  popOutTab: (tabId) => ipcRenderer.invoke("window:popOutTab", tabId),

  // package store managed by the external pi installation
  searchPackages: (query) => ipcRenderer.invoke("packages:search", query),
  listInstalledPackages: () => ipcRenderer.invoke("packages:listInstalled"),
  listPackageResources: () => ipcRenderer.invoke("packages:listResources"),
  setPackageResourceEnabled: (resource, enabled) => ipcRenderer.invoke("packages:setResourceEnabled", { resource, enabled }),
  installPackage: (name, scope) => ipcRenderer.invoke("packages:install", { name, scope }),
  removePackage: (name, scope) => ipcRenderer.invoke("packages:remove", { name, scope }),
  installPackageSource: (source, scope) => ipcRenderer.invoke("packages:installSource", { source, scope }),
  removePackageSource: (source, scope) => ipcRenderer.invoke("packages:removeSource", { source, scope }),
  updatePackages: (target) => ipcRenderer.invoke("packages:update", target),

  // events from main
  on(channel, cb) {
    const ALLOWED_CHANNELS = ["pi:event", "pi:maintenance-output", "pi:package-output", "pi:auth-request", "pi:tray-new-chat", "update:state"];
    if (!ALLOWED_CHANNELS.includes(channel)) return () => {};
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, handler);
    listeners.set(cb, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
      listeners.delete(cb);
    };
  },
});
