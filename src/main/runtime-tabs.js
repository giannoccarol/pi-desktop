"use strict";

const { PiRuntime } = require("./runtime");

const FORWARDED_METHODS = [
  "steer", "followUp", "abort", "forceStopAndRecover", "getAvailableModels",
  "setModel", "setThinkingLevel", "getThinkingLevels", "getSessionStats",
  "getCommands", "getTree", "getEntries", "getForkMessages", "fork", "clone",
  "getLastAssistantText", "setSessionName", "compact", "setAutoCompaction",
  "setAutoRetry", "abortRetry", "setSteeringMode", "setFollowUpMode",
  "exportHtml", "abortBash",
];

/**
 * Keeps one independent Pi RPC runtime per open chat tab.
 * Switching the active tab only changes routing; it never switches or aborts
 * the session inside another Pi process.
 */
class RuntimeTabs {
  constructor(sendToRenderer, runtimeFactory = (send) => new PiRuntime(send)) {
    this.send = sendToRenderer;
    this.runtimeFactory = runtimeFactory;
    this.tabs = new Map();
    this.activeId = null;
    this.nextId = 1;
    this.pendingUi = new Map();
  }

  _newId() {
    return `chat-${Date.now().toString(36)}-${this.nextId++}`;
  }

  _create(meta = {}) {
    const id = this._newId();
    const tab = {
      id,
      cwd: meta.cwd || null,
      sessionFile: meta.sessionFile || null,
      title: meta.title || "Nuova chat",
      createdAt: Date.now(),
      busy: false,
      hasContent: Boolean(meta.sessionFile),
      runtime: null,
    };
    tab.runtime = this.runtimeFactory((channel, payload) => this._onRuntimeEvent(tab, channel, payload));
    this.tabs.set(id, tab);
    this.activeId = id;
    return tab;
  }

  _onRuntimeEvent(tab, channel, payload) {
    if (channel === "pi:event") {
      if (payload?.type === "agent_start") tab.busy = true;
      if (payload?.type === "agent_settled" || payload?.type === "pi-exit" || payload?.type === "pi-started") tab.busy = false;
      if (payload?.type === "extension_ui_request" && payload.id) this.pendingUi.set(payload.id, tab.id);
    }
    this.send(channel, { ...payload, tabId: tab.id });
  }

  _active() {
    return this.tabs.get(this.activeId) || this._create();
  }

  _sync(tab, state) {
    if (!state) return;
    if (state.sessionFile) {
      tab.sessionFile = state.sessionFile;
      tab.hasContent = true;
    }
    if (typeof state.isStreaming === "boolean") tab.busy = state.isStreaming;
    if (state.sessionName) tab.title = state.sessionName;
  }

  get running() {
    return this._active().runtime.running;
  }

  async ensureStarted(opts = {}) {
    const tab = this._active();
    if (opts.cwd) tab.cwd = opts.cwd;
    await tab.runtime.ensureStarted(opts);
    return tab.runtime;
  }

  async start(opts = {}) {
    const tab = this._active();
    if (!tab.runtime.running) await this.ensureStarted(opts);
    return { ok: true, tabId: this.activeId };
  }

  async prompt(message, images, streamingBehavior) {
    const tab = this._active();
    tab.hasContent = true;
    if (tab.title === "Nuova chat" && typeof message === "string" && message.trim()) {
      tab.title = message.trim().replace(/\s+/g, " ").slice(0, 56);
    }
    const result = await tab.runtime.prompt(message, images, streamingBehavior);
    const state = await tab.runtime.getState().catch(() => null);
    this._sync(tab, state);
    return result;
  }

  async getState() {
    const tab = this._active();
    const state = await tab.runtime.getState();
    this._sync(tab, state);
    return { ...state, tabId: tab.id };
  }

  getMessages() {
    return this._active().runtime.getMessages();
  }

  async bash(command, excludeFromContext) {
    const tab = this._active();
    tab.busy = true;
    this.send("pi:event", { type: "tab_status", busy: true, tabId: tab.id });
    try {
      return await tab.runtime.bash(command, excludeFromContext);
    } finally {
      tab.busy = false;
      this.send("pi:event", { type: "tab_status", busy: false, tabId: tab.id });
    }
  }

  async newSession(opts = {}) {
    let tab = this._active();
    if (tab.hasContent || tab.sessionFile || tab.busy) tab = this._create({ cwd: opts.cwd });
    tab.cwd = opts.cwd || tab.cwd;
    tab.sessionFile = null;
    tab.title = "Nuova chat";
    tab.hasContent = false;
    try {
      const result = await tab.runtime.newSession(opts);
      return { ...(result || {}), tabId: tab.id };
    } catch (error) {
      if (!tab.runtime.running && this.tabs.size > 1) {
        this.tabs.delete(tab.id);
        this.activeId = this.tabs.keys().next().value || null;
      }
      throw error;
    }
  }

  async openSession(sessionPath, opts = {}) {
    let tab = [...this.tabs.values()].find((candidate) => candidate.sessionFile === sessionPath);
    if (tab) {
      this.activeId = tab.id;
      return { ok: true, tabId: tab.id, reused: true };
    }
    tab = this._create({ cwd: opts.cwd, sessionFile: sessionPath, title: opts.title });
    try {
      const result = await tab.runtime.openSession(sessionPath, opts);
      const state = await tab.runtime.getState().catch(() => null);
      this._sync(tab, state);
      return { ...(result || {}), tabId: tab.id, reused: false };
    } catch (error) {
      tab.runtime.stop();
      this.tabs.delete(tab.id);
      this.activeId = this.tabs.keys().next().value || null;
      throw error;
    }
  }

  activate(tabId) {
    if (!this.tabs.has(tabId)) throw new Error("Tab chat non disponibile");
    this.activeId = tabId;
    return { ok: true, tabId };
  }

  list() {
    return [...this.tabs.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ runtime, ...tab }) => ({ ...tab, active: tab.id === this.activeId }));
  }

  close(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return { ok: true, activeId: this.activeId };
    tab.runtime.stop();
    this.tabs.delete(tabId);
    if (this.activeId === tabId) {
      this.activeId = this.tabs.keys().next().value || null;
    }
    return { ok: true, activeId: this.activeId, tabs: this.list() };
  }

  uiRespond(id, payload) {
    const tabId = this.pendingUi.get(id) || this.activeId;
    this.pendingUi.delete(id);
    return this.tabs.get(tabId)?.runtime.uiRespond(id, payload);
  }

  async restart(overrides = {}) {
    await Promise.all([...this.tabs.values()].map(async (tab) => {
      try { await tab.runtime.restart(overrides); }
      catch { tab.runtime.stop(); tab.busy = false; }
    }));
  }

  stop() {
    for (const tab of this.tabs.values()) tab.runtime.stop();
    this.tabs.clear();
    this.activeId = null;
    this.pendingUi.clear();
  }
}

for (const method of FORWARDED_METHODS) {
  RuntimeTabs.prototype[method] = function (...args) {
    return this._active().runtime[method](...args);
  };
}

module.exports = { RuntimeTabs };
