"use strict";

const { PiRuntime } = require("./runtime");

const FORWARDED_METHODS = [
  "forceStopAndRecover", "getAvailableModels",
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
    // At most one coalesced token delta per tab. Background tabs are recovered
    // from their authoritative runtime when selected, so they do not need to
    // flood Electron IPC while several agents write concurrently.
    this.pendingDeltas = new Map();
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

  _flushPendingDelta(tab, deliver = true) {
    const pending = this.pendingDeltas.get(tab.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingDeltas.delete(tab.id);
    if (deliver && tab.id === this.activeId) {
      this.send("pi:event", { ...pending.payload, tabId: tab.id });
    }
  }

  _queueDelta(tab, payload) {
    const event = payload?.assistantMessageEvent;
    let key = null;
    let mode = "replace";
    let copy = payload;
    if (payload?.type === "message_update" && event && ["text_delta", "thinking_delta", "toolcall_delta"].includes(event.type)) {
      key = `message:${event.type}:${event.contentIndex ?? ""}`;
      mode = "assistant-delta";
      copy = { ...payload, assistantMessageEvent: { ...event, delta: event.delta || "" } };
    } else if (payload?.type === "bash_execution_update") {
      key = "bash";
      mode = "bash-delta";
      copy = { ...payload, delta: payload.delta || "" };
    } else if (payload?.type === "tool_execution_update") {
      key = `tool:${payload.toolCallId || ""}`;
      copy = { ...payload };
    } else {
      return false;
    }

    const pending = this.pendingDeltas.get(tab.id);
    if (pending && pending.key === key) {
      if (mode === "assistant-delta") pending.payload.assistantMessageEvent.delta += event.delta || "";
      else if (mode === "bash-delta") pending.payload.delta += payload.delta || "";
      else pending.payload = copy; // only the newest full partial tool result matters
      return true;
    }
    if (pending) this._flushPendingDelta(tab, true);
    const timer = setTimeout(() => this._flushPendingDelta(tab, true), 16);
    timer.unref?.();
    this.pendingDeltas.set(tab.id, { key, payload: copy, timer });
    return true;
  }

  _onRuntimeEvent(tab, channel, payload) {
    if (channel !== "pi:event") {
      this.send(channel, { ...payload, tabId: tab.id });
      return;
    }

    const wasBusy = tab.busy;
    if (payload?.type === "agent_start") tab.busy = true;
    if (payload?.type === "agent_settled" || payload?.type === "pi-exit" || payload?.type === "pi-started") tab.busy = false;
    if (payload?.type === "extension_ui_request" && payload.id) this.pendingUi.set(payload.id, tab.id);

    const isActive = tab.id === this.activeId;
    const isUiRequest = payload?.type === "extension_ui_request";
    if (!isActive && !isUiRequest) {
      this._flushPendingDelta(tab, false);
      // The inactive transcript is intentionally not mirrored to the renderer:
      // get_messages catches it up on selection. Only navigation state crosses IPC.
      if (tab.busy !== wasBusy || payload?.type === "pi-exit") {
        this.send("pi:event", { type: "tab_status", busy: tab.busy, tabId: tab.id });
      }
      return;
    }

    if (this._queueDelta(tab, payload)) return;
    // Structural events must follow any buffered text they terminate.
    this._flushPendingDelta(tab, true);
    this.send(channel, { ...payload, tabId: tab.id });
  }

  _active() {
    return this.tabs.get(this.activeId) || this._create();
  }

  /**
   * Route to an explicit tab when the caller knows which chat it is talking
   * to; fall back to the active tab otherwise. This keeps messages from
   * landing in the wrong chat while a tab switch is still in flight.
   */
  _resolve(tabId) {
    if (tabId && this.tabs.has(tabId)) return this.tabs.get(tabId);
    return this._active();
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
    if (opts.cwd) tab.cwd = opts.cwd;
    if (!tab.runtime.running) await this.ensureStarted(opts);
    return { ok: true, tabId: this.activeId };
  }

  async prompt(message, images, streamingBehavior, tabId) {
    const tab = this._resolve(tabId);
    tab.hasContent = true;
    if (tab.title === "Nuova chat" && typeof message === "string" && message.trim()) {
      tab.title = message.trim().replace(/\s+/g, " ").slice(0, 56);
    }
    const result = await tab.runtime.prompt(message, images, streamingBehavior);
    const state = await tab.runtime.getState().catch(() => null);
    this._sync(tab, state);
    return result;
  }

  async getState(tabId) {
    const tab = this._resolve(tabId);
    const state = await tab.runtime.getState();
    this._sync(tab, state);
    return { ...state, tabId: tab.id };
  }

  getMessages(tabId) {
    return this._resolve(tabId).runtime.getMessages();
  }

  steer(message, images, tabId) {
    return this._resolve(tabId).runtime.steer(message, images);
  }

  followUp(message, images, tabId) {
    return this._resolve(tabId).runtime.followUp(message, images);
  }

  abort(tabId) {
    return this._resolve(tabId).runtime.abort();
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
    const targetCwd = opts.cwd || tab.cwd || null;
    const cwdChanged = Boolean(targetCwd && tab.cwd && targetCwd !== tab.cwd);
    if (tab.hasContent || tab.sessionFile || tab.busy || cwdChanged) {
      tab = this._create({ cwd: targetCwd });
    } else if (targetCwd) {
      tab.cwd = targetCwd;
    }
    tab.sessionFile = null;
    tab.title = "Nuova chat";
    tab.hasContent = false;
    try {
      const result = await tab.runtime.newSession(opts);
      return { ...(result || {}), tabId: tab.id };
    } catch (error) {
      if (!tab.runtime.running && this.tabs.size > 1) {
        this._flushPendingDelta(tab, false);
        this.tabs.delete(tab.id);
        this.activeId = this.tabs.keys().next().value || null;
      }
      throw error;
    }
  }

  async openSession(sessionPath, opts = {}) {
    let tab = [...this.tabs.values()].find((candidate) => candidate.sessionFile === sessionPath);
    if (tab) {
      this.activate(tab.id);
      return { ok: true, tabId: tab.id, reused: true };
    }
    tab = this._create({ cwd: opts.cwd, sessionFile: sessionPath, title: opts.title });
    try {
      const result = await tab.runtime.openSession(sessionPath, opts);
      const state = await tab.runtime.getState().catch(() => null);
      this._sync(tab, state);
      return { ...(result || {}), tabId: tab.id, reused: false };
    } catch (error) {
      this._flushPendingDelta(tab, false);
      tab.runtime.stop();
      this.tabs.delete(tab.id);
      this.activeId = this.tabs.keys().next().value || null;
      throw error;
    }
  }

  activate(tabId) {
    if (!this.tabs.has(tabId)) throw new Error("Tab chat non disponibile");
    const previous = this.tabs.get(this.activeId);
    if (previous && previous.id !== tabId) this._flushPendingDelta(previous, false);
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
    this._flushPendingDelta(tab, false);
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
    for (const tab of this.tabs.values()) {
      this._flushPendingDelta(tab, false);
      tab.runtime.stop();
    }
    this.tabs.clear();
    this.activeId = null;
    this.pendingUi.clear();
    this.pendingDeltas.clear();
  }
}

for (const method of FORWARDED_METHODS) {
  RuntimeTabs.prototype[method] = function (...args) {
    return this._active().runtime[method](...args);
  };
}

module.exports = { RuntimeTabs };
