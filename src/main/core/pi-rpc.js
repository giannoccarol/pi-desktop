"use strict";

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const { StringDecoder } = require("string_decoder");

/**
 * Client for `pi --mode rpc`.
 *
 * Protocol notes (docs/rpc.md of @earendil-works/pi-coding-agent):
 * - Strict JSONL framing: records are split on "\n" ONLY. Node's readline is
 *   NOT protocol-compliant because it also splits on U+2028/U+2029 which are
 *   valid inside JSON strings. We implement a manual splitter here.
 * - Commands go to stdin as single-line JSON objects; an optional "id" field
 *   correlates the "type":"response" answer.
 * - Everything else on stdout is an event and is re-emitted.
 */
class PiRpcClient extends EventEmitter {
  /**
   * @param {string} bin path to the pi executable
   * @param {object} opts
   * @param {string[]} [opts.args] extra CLI args
   * @param {string} [opts.cwd] working directory for the agent
   * @param {object} [opts.env] extra environment variables
   */
  constructor(bin, opts = {}) {
    super();
    this.bin = bin;
    this.opts = opts;
    this.proc = null;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.nextId = 1;
    this.pending = new Map();
    this.exitInfo = null;
    this.started = false;
  }

  start() {
    if (this.proc) return;
    // rawArgs is used by tests that spawn a script directly; real usage
    // always spawns the pi binary with its RPC flag.
    const args = this.opts.rawArgs
      ? [...(this.opts.args || [])]
      : ["--mode", "rpc", ...(this.opts.args || [])];
    const env = { ...process.env, ...(this.opts.env || {}) };
    this.exitInfo = null;
    // On Windows npm global installs expose `pi` as a .cmd shim, which cannot
    // be spawned directly; route it through the shell (cmd.exe).
    const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(this.bin);
    this.proc = spawn(this.bin, args, {
      cwd: this.opts.cwd || undefined,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: needsShell,
      windowsHide: true,
    });
    this.started = true;

    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    let stderrTail = "";
    this.proc.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-8000);
    });
    this.proc.on("error", (err) => {
      const info = { code: null, signal: null, error: String(err && err.message), stderr: stderrTail };
      this.exitInfo = info;
      this.emit("exit", info);
    });
    this.proc.on("close", (code, signal) => {
      // Flush any complete final record left in the buffer.
      if (this.buffer.length > 0) {
        this._handleLine(this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer);
        this.buffer = "";
      }
      const info = { code, signal, error: null, stderr: stderrTail, expected: Boolean(this.expectedExit) };
      this.exitInfo = info;
      this._rejectAllPending(new Error(this._exitMessage(info)));
      this.proc = null;
      this.emit("exit", info);
    });
  }

  _exitMessage(info) {
    let msg = `pi process exited (${info.code != null ? `code ${info.code}` : `signal ${info.signal}`})`;
    if (info.error) msg += ` error: ${info.error}`;
    const tail = (info.stderr || "").trim().split("\n").pop();
    if (tail) msg += `: ${tail.slice(0, 400)}`;
    return msg;
  }

  _onData(chunk) {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    let idx;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this._handleLine(line);
    }
  }

  _handleLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      this.emit("protocol-error", err, line.slice(0, 500));
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "response" && msg.id != null && this.pending.has(msg.id)) {
      const { resolve } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      resolve(msg);
      return;
    }
    this.emit("message", msg);
  }

  /** Send a raw command object. Resolves with the response message. */
  request(command, timeoutMs = 600000) {
    if (!this.proc || !this.proc.stdin.writable) {
      return Promise.reject(new Error("pi process is not running"));
    }
    const id = `req-${this.nextId++}`;
    const payload = { id, ...command };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`pi rpc timeout for command "${command.type}"`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
      this.proc.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  /** Like request() but rejects when success:false. */
  async call(command, timeoutMs) {
    const res = await this.request(command, timeoutMs);
    if (!res.success) {
      const err = new Error(res.error || `Command ${command.type} failed`);
      err.response = res;
      throw err;
    }
    return res.data;
  }

  send(command) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error("pi process is not running");
    this.proc.stdin.write(JSON.stringify(command) + "\n");
  }

  /** Answer an extension UI dialog request. */
  respondUi(id, payload) {
    this.send({ type: "extension_ui_response", id, ...payload });
  }

  _rejectAllPending(err) {
    for (const [, entry] of this.pending) entry.resolve({ type: "response", success: false, error: err.message });
    this.pending.clear();
  }

  kill() {
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    if (process.platform === "win32") {
      // With shell:true the child is cmd.exe; kill the whole tree so the real
      // pi process does not linger.
      try {
        spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
      } catch {}
      return;
    }
    try {
      p.kill("SIGTERM");
    } catch {}
    setTimeout(() => {
      try {
        if (p.exitCode === null && p.signalCode === null) p.kill("SIGKILL");
      } catch {}
    }, 2000).unref?.();
  }
}

module.exports = { PiRpcClient };
