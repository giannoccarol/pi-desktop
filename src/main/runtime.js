"use strict";

const { PiRpcClient } = require("./pi-rpc");
const { whichPi } = require("./updater");

/**
 * Owns the external `pi --mode rpc` process and bridges it to the renderer.
 *
 * Persistence strategy (keeps pi's own storage authoritative):
 * - The agent is started with --no-session while the user is only browsing,
 *   so launching the app or opening a blank chat never litters ~/.pi/agent
 *   with empty session files.
 * - As soon as real content exists (first prompt on a blank chat), we
 *   transparently respawn without --no-session, then replay the command.
 * - Opening an old chat uses the documented switch_session RPC command.
 */
class PiRuntime {
  constructor(sendToRenderer) {
    this.send = sendToRenderer; // (channel, payload) => void
    this.client = null;
    this.startOpts = null;
    this.starting = null;
    this.currentSessionFile = null;
  }

  _emit(type, payload) {
    this.send("pi:event", { type, ...payload });
  }

  async ensureStarted(opts = {}) {
    const wanted = {
      cwd: opts.cwd || undefined,
      provider: opts.provider || undefined,
      model: opts.model || undefined,
      persist: Boolean(opts.persist),
      sessionPath: opts.sessionPath || null,
      sessionDir: opts.sessionDir || undefined,
      piPath: opts.piPath || undefined,
      name: opts.name || undefined,
    };
    if (this.client && this._matches(wanted) && !this.exitInfo) return this.client;
    if (this.starting) await this.starting;
    if (this.client && this._matches(wanted) && !this.exitInfo) return this.client;
    return this._start(wanted);
  }

  _matches(w) {
    const s = this.startOpts;
    if (!s) return false;
    return (
      s.cwd === w.cwd && s.persist === w.persist && (s.sessionPath || null) === w.sessionPath && s.sessionDir === w.sessionDir
    );
  }

  async _start(wanted) {
    this._teardown();
    const bin = await whichPi(wanted.piPath);
    if (!bin) {
      const err = new Error("pi non installato");
      err.code = "PI_NOT_INSTALLED";
      throw err;
    }
    const args = [];
    if (!wanted.persist) args.push("--no-session");
    if (wanted.provider) args.push("--provider", wanted.provider);
    if (wanted.model) args.push("--model", wanted.model);
    if (wanted.name) args.push("--name", wanted.name);
    if (wanted.sessionDir) args.push("--session-dir", wanted.sessionDir);

    const client = new PiRpcClient(bin, { cwd: wanted.cwd, args });
    let markSpawned = null;
    const startPromise = new Promise((resolve, reject) => {
      let settled = false;
      const onExit = (info) => {
        if (!settled) {
          settled = true;
          reject(new Error(info.stderr ? `pi è uscito subito: ${info.stderr.slice(0, 300)}` : "pi è uscito subito"));
        }
        this.exitInfo = info;
        this._emit("pi-exit", { info });
      };
      markSpawned = () => {
        if (settled) return;
        settled = true;
        resolve(client);
      };
      client.once("exit", onExit);
      client.on("message", (msg) => this._onMessage(msg));
      // Fallback for unusual platforms where ChildProcess does not emit spawn.
      setTimeout(markSpawned, 250).unref?.();
    });

    client.start();
    // stdin safely buffers commands while pi initializes. Waiting a fixed 250ms
    // on every cold history tab only added latency; process spawn is sufficient.
    client.proc?.once("spawn", markSpawned);
    this.starting = startPromise;
    try {
      await startPromise;
    } finally {
      this.starting = null;
    }
    this.client = client;
    this.exitInfo = null;
    this.startOpts = wanted;
    this.currentSessionFile = wanted.sessionPath;

    // If we are resuming a specific session file right away, load it.
    if (wanted.sessionPath) {
      try {
        await client.call({ type: "switch_session", sessionPath: wanted.sessionPath });
        this.currentSessionFile = wanted.sessionPath;
      } catch (err) {
        this._teardown();
        throw err;
      }
    }
    this._emit("pi-started", { cwd: wanted.cwd || null, persist: wanted.persist });
    return client;
  }

  _teardown() {
    if (this.client) {
      this.client.removeAllListeners();
      this.client.expectedExit = true;
      this.client.kill();
      this.client = null;
    }
    this.startOpts = null;
  }

  _onMessage(msg) {
    if (msg.type === "extension_ui_request") {
      const dialogMethods = ["select", "confirm", "input", "editor"];
      if (dialogMethods.includes(msg.method)) {
        // Bridge to renderer; it must answer via ui-respond.
        this.send("pi:event", msg);
      } else {
        // Fire-and-forget: notify / setStatus / setWidget / setTitle / set_editor_text
        this.send("pi:event", msg);
      }
      return;
    }
    this.send("pi:event", msg);
  }

  get running() {
    return Boolean(this.client && this.client.proc && !this.exitInfo);
  }

  /** Send a user prompt; guarantees a persisted session for real content. */
  async prompt(message, images, streamingBehavior) {
    const needsPersistence = true;
    const st = this.startOpts;
    if (this.running && st && !st.persist && needsPersistence) {
      // Blank ephemeral chat -> restart persistent, then prompt into it.
      let selected = null;
      try {
        selected = await this.client.call({ type: "get_state" });
      } catch {}
      await this.ensureStarted({
        ...st,
        persist: true,
        provider: selected?.model?.provider || st.provider,
        model: selected?.model?.id || st.model,
      });
      if (selected?.thinkingLevel) {
        try {
          await this.setThinkingLevel(selected.thinkingLevel);
        } catch {}
      }
    }
    const result = await this._request({ type: "prompt", message, ...(images ? { images } : {}), ...(streamingBehavior ? { streamingBehavior } : {}) });
    this.getState().then((state) => {
      if (state?.sessionFile) this.currentSessionFile = state.sessionFile;
    }).catch(() => {});
    return result;
  }

  steer(message, images) {
    return this._request({ type: "steer", message, ...(images ? { images } : {}) });
  }

  followUp(message, images) {
    return this._request({ type: "follow_up", message, ...(images ? { images } : {}) });
  }

  abort() {
    return this._request({ type: "abort" }, 5000);
  }

  async getState() {
    const state = await this._request({ type: "get_state" });
    if (state?.sessionFile) this.currentSessionFile = state.sessionFile;
    return state;
  }

  getMessages() {
    return this._request({ type: "get_messages" });
  }

  getAvailableModels() {
    return this._request({ type: "get_available_models" }, 60000);
  }

  setModel(provider, modelId) {
    return this._request({ type: "set_model", provider, modelId });
  }

  setThinkingLevel(level) {
    return this._request({ type: "set_thinking_level", level });
  }

  getThinkingLevels() {
    return this._request({ type: "get_available_thinking_levels" });
  }

  getSessionStats() {
    return this._request({ type: "get_session_stats" });
  }

  getCommands() {
    return this._request({ type: "get_commands" });
  }

  getTree() {
    return this._request({ type: "get_tree" });
  }

  getEntries(since) {
    return this._request({ type: "get_entries", ...(since ? { since } : {}) });
  }

  getForkMessages() {
    return this._request({ type: "get_fork_messages" });
  }

  fork(entryId) {
    return this._request({ type: "fork", entryId });
  }

  clone() {
    return this._request({ type: "clone" });
  }

  getLastAssistantText() {
    return this._request({ type: "get_last_assistant_text" });
  }

  setSessionName(name) {
    return this._request({ type: "set_session_name", name });
  }

  compact(customInstructions) {
    return this._request({ type: "compact", ...(customInstructions ? { customInstructions } : {}) }, 600000);
  }

  setAutoCompaction(enabled) {
    return this._request({ type: "set_auto_compaction", enabled: Boolean(enabled) });
  }

  setAutoRetry(enabled) {
    return this._request({ type: "set_auto_retry", enabled: Boolean(enabled) });
  }

  abortRetry() {
    return this._request({ type: "abort_retry" });
  }

  setSteeringMode(mode) {
    return this._request({ type: "set_steering_mode", mode });
  }

  setFollowUpMode(mode) {
    return this._request({ type: "set_follow_up_mode", mode });
  }

  exportHtml(outputPath) {
    return this._request({ type: "export_html", ...(outputPath ? { outputPath } : {}) }, 60000);
  }

  bash(command, excludeFromContext = false) {
    return this._request({ type: "bash", command, excludeFromContext: Boolean(excludeFromContext) }, 600000);
  }

  abortBash() {
    return this._request({ type: "abort_bash" }, 5000);
  }

  async forceStopAndRecover() {
    const snapshot = { ...(this.startOpts || {}) };
    const sessionPath = this.currentSessionFile || snapshot.sessionPath || null;
    const client = this.client;
    const proc = client?.proc;
    this.client = null;
    this.startOpts = null;
    this.starting = null;
    this.exitInfo = null;
    if (client) {
      client.removeAllListeners();
      client.expectedExit = true;
      const closed = proc ? new Promise((resolve) => {
        proc.once("close", resolve);
        setTimeout(resolve, 2400).unref?.();
      }) : Promise.resolve();
      client.kill();
      await closed;
    }
    this.currentSessionFile = sessionPath;
    if (!snapshot.cwd) return { restarted: false, sessionPath };
    await this._start({
      ...snapshot,
      persist: Boolean(sessionPath),
      sessionPath,
    });
    return { restarted: true, sessionPath };
  }

  async newSession(opts = {}) {
    // Blank chat: restart as ephemeral (--no-session) so launching a new chat
    // never creates empty session files; persistence kicks in on first prompt.
    const client = await this.ensureStarted({
      ...(this.startOpts || {}),
      cwd: opts.cwd || this.startOpts?.cwd,
      piPath: opts.piPath || this.startOpts?.piPath,
      provider: opts.provider || this.startOpts?.provider,
      model: opts.model || this.startOpts?.model,
      sessionDir: opts.sessionDir || this.startOpts?.sessionDir,
      persist: false,
      sessionPath: null,
    });
    const res = await client.request({ type: "new_session", ...(opts.parentSession ? { parentSession: opts.parentSession } : {}) });
    if (!res.success) throw new Error(res.error || "new_session fallito");
    await Promise.all([
      opts.provider && opts.model ? this.setModel(opts.provider, opts.model) : Promise.resolve(),
      opts.thinkingLevel ? this.setThinkingLevel(opts.thinkingLevel) : Promise.resolve(),
    ]);
    this.currentSessionFile = null;
    return res.data;
  }

  /** Open an existing chat from history. */
  async openSession(sessionPath, opts = {}) {
    if (!this.running || !this.startOpts?.persist) {
      await this._start({
        cwd: opts.cwd,
        persist: true,
        sessionPath,
        piPath: opts.piPath,
        provider: opts.provider,
        model: opts.model,
        sessionDir: opts.sessionDir,
      });
      await Promise.all([
        opts.provider && opts.model ? this.setModel(opts.provider, opts.model) : Promise.resolve(),
        opts.thinkingLevel ? this.setThinkingLevel(opts.thinkingLevel) : Promise.resolve(),
      ]);
      return { ok: true };
    }
    const res = await this._request({ type: "switch_session", sessionPath });
    this.currentSessionFile = sessionPath;
    const st = this.startOpts;
    this.startOpts = { ...st, persist: true, sessionPath };
    await Promise.all([
      opts.provider && opts.model ? this.setModel(opts.provider, opts.model) : Promise.resolve(),
      opts.thinkingLevel ? this.setThinkingLevel(opts.thinkingLevel) : Promise.resolve(),
    ]);
    return res;
  }

  uiRespond(id, payload) {
    if (this.client) this.client.respondUi(id, payload);
  }

  async restart(overrides = {}) {
    if (!this.running) return;
    const opts = { ...(this.startOpts || {}) };
    let sessionPath = opts.sessionPath || this.currentSessionFile || null;
    try {
      const state = await this.client.call({ type: "get_state" });
      sessionPath = state.sessionFile || sessionPath;
    } catch {}
    await this._start({
      ...opts,
      ...overrides,
      persist: Boolean(sessionPath || opts.persist),
      sessionPath,
    });
  }

  async _request(command, timeoutMs) {
    const client = await this.ensureStarted(this.startOpts || {});
    const res = await client.request(command, timeoutMs);
    if (!res.success) {
      const err = new Error(res.error || `Comando ${command.type} fallito`);
      err.response = res;
      throw err;
    }
    return res.data;
  }

  stop() {
    this._teardown();
  }
}

module.exports = { PiRuntime };
