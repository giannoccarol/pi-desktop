"use strict";

/**
 * Pure, testable utilities extracted from app.js
 * - No DOM, no state, no i18n side-effects (dependencies passed as args when needed)
 * - Exposed as window.piUtils in the renderer and as CommonJS for node:test
 * - Behaviour LOCKED by test/renderer-utils.test.mjs — do not change without updating tests
 */

(function exposeUtils(root) {
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fmtCost(c) {
    if (c !== 0 && !c) return "";
    const n = Number(c);
    if (!Number.isFinite(n)) return "";
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(4)}`;
  }

  function fmtTokens(n) {
    if (n == null) return "";
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.trunc(v));
  }

  // Meta poco intrusiva per il footer del messaggio completato: ["2.7s", "1200.0 tok/s"].
  // I secondi ci sono sempre, tok/s solo con output>0 e durata>0.
  function speedMeta(usage, startedAtMs, nowMs = Date.now()) {
    const start = Number(startedAtMs);
    const now = Number(nowMs);
    if (!Number.isFinite(start) || !Number.isFinite(now)) return [];
    const secs = Math.max(0, (now - start) / 1000);
    const meta = [`${secs.toFixed(1)}s`];
    const out = Number(usage?.output ?? usage?.totalTokens);
    if (Number.isFinite(out) && out > 0 && secs > 0) meta.push(`${(out / secs).toFixed(1)} tok/s`);
    return meta;
  }

  function cacheHitStats(tokens) {
    const input = Math.max(0, Number(tokens?.input) || 0);
    const cacheRead = Math.max(0, Number(tokens?.cacheRead) || 0);
    const cacheWrite = Math.max(0, Number(tokens?.cacheWrite) || 0);
    const prompt = input + cacheRead + cacheWrite;
    return {
      percent: prompt > 0 ? Math.round((cacheRead / prompt) * 100) : null,
      cacheRead,
      cacheWrite,
      prompt,
    };
  }

  function basename(p) {
    if (!p) return "";
    return String(p).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  }

  function truncate(s, n) {
    const str = s == null ? "" : String(s);
    const limit = Number(n);
    if (!str || !Number.isFinite(limit) || limit <= 0) return str;
    return str.length > limit ? str.slice(0, limit - 1) + "…" : str;
  }

  function clipboardImageExtension(mimeType) {
    const m = String(mimeType || "").toLowerCase();
    return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[m] || "png";
  }

  function bufferToBase64(buffer) {
    // Browser: use btoa, Node: use Buffer
    if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(buffer)) {
      return buffer.toString("base64");
    }
    if (buffer instanceof ArrayBuffer) {
      buffer = new Uint8Array(buffer);
    }
    if (buffer instanceof Uint8Array) {
      // chunked to avoid stack overflow on large buffers
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize));
      }
      // btoa available in browser and Node 16+ via global, fallback to Buffer
      if (typeof btoa === "function") return btoa(binary);
      if (typeof Buffer !== "undefined") return Buffer.from(binary, "binary").toString("base64");
      return binary;
    }
    // Fallback: assume already string
    return String(buffer);
  }

  function parsedToolArgs(args) {
    if (args && typeof args === "object") return args;
    if (typeof args !== "string") return {};
    try {
      return JSON.parse(args);
    } catch {
      return { value: args };
    }
  }

  function fullToolArgs(args) {
    try {
      return typeof args === "string" ? args : JSON.stringify(args) || "";
    } catch {
      return "";
    }
  }

  function changedLineCounts(args) {
    const edits = Array.isArray(args?.edits) ? args.edits : [args];
    let removed = 0;
    let added = 0;
    for (const edit of edits) {
      const oldText = edit?.oldText ?? edit?.old_string ?? "";
      const newText = edit?.newText ?? edit?.new_string ?? edit?.content ?? "";
      if (oldText) removed += String(oldText).split("\n").length;
      if (newText) added += String(newText).split("\n").length;
    }
    return { added, removed };
  }

  function compactProjectPath(value, cwd) {
    const input = String(value || "").replace(/\\/g, "/");
    const base = String(cwd || "").replace(/\\/g, "/").replace(/\/$/, "");
    if (base && (input === base || input.startsWith(`${base}/`))) return input.slice(base.length + 1) || ".";
    const parts = input.split("/").filter(Boolean);
    return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : input;
  }

  function stripAnsi(value) {
    return String(value || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  }

  // relTime is pure if we inject `now` and `t` — keep original behaviour but testable
  function relTime(ms, nowMs = Date.now(), t = (typeof window !== "undefined" && window.t) || (typeof globalThis !== "undefined" && globalThis.t) || ((k) => k)) {
    let ts = Number(ms);
    if (!Number.isFinite(ts)) return t("time.notAvailable");
    if (ts > 0 && ts < 1e12) ts *= 1000; // epoch seconds
    const d = nowMs - ts;
    const m = Math.floor(d / 60000);
    if (m < 1) return t("time.now");
    if (m < 60) return t("time.minutes", { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("time.hours", { n: h });
    const dd = Math.floor(h / 24);
    if (dd < 7) return t("time.days", { n: dd });
    return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  }

  function preferenceLabel(preference) {
    if (!preference) return "";
    return [preference.provider, preference.modelId, preference.thinkingLevel].filter(Boolean).join(" · ");
  }

  function textOfBlocks(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
  }

  function isActivityOnly(blocks) {
    const items = Array.isArray(blocks) ? blocks : [];
    const hasActivity = items.some((block) => block?.type === "toolCall" || block?.type === "thinking");
    const hasAnswer = items.some((block) => block?.type === "image" || (block?.type === "text" && Boolean(block.text?.trim())));
    return hasActivity && !hasAnswer;
  }

  function toolIconName(toolName) {
    const name = String(toolName || "").toLowerCase();
    if (name === "read") return "book-open";
    if (["edit", "write"].includes(name)) return "pencil";
    if (["grep", "find", "search"].includes(name)) return "search";
    if (["bash", "shell", "powershell"].some((value) => name.startsWith(value))) return "terminal";
    if (name === "ls") return "folder-open";
    if (name === "todo") return "list-checks";
    return "wrench";
  }

  // To-do in stile Codex: estrae una lista di attivita' da args/risultati del
  // tool "todo" in forma tollerante (chiavi e stati diversi a seconda del backend).
  // Ritorna [{title, status}] con status in pending|in_progress|completed.
  function normalizeTodoStatus(value) {
    const s = String(value ?? "").toLowerCase().replace(/[\s-]+/g, "_");
    if (["completed", "complete", "done", "closed", "finished", "success", "checked", "true"].includes(s)) return "completed";
    if (["in_progress", "inprogress", "doing", "running", "active", "started"].includes(s)) return "in_progress";
    return "pending";
  }

  function parseTodoItems(value) {
    let root = value;
    if (typeof root === "string") {
      const trimmed = root.trim();
      if (!trimmed) return [];
      try { root = JSON.parse(trimmed); } catch { return []; }
    }
    if (!root || typeof root !== "object") return [];
    const list = Array.isArray(root)
      ? root
      : (root.tasks ?? root.todos ?? root.items ?? root.list ?? root.entries ?? root.children ?? null);
    const raw = Array.isArray(list) ? list : (list != null ? [list] : [root]);
    return raw.map((entry) => {
      if (typeof entry === "string") return { title: entry, status: "pending" };
      if (!entry || typeof entry !== "object") return null;
      const title = entry.subject ?? entry.title ?? entry.name ?? entry.label ?? entry.text ?? entry.content ?? entry.task ?? "";
      const flag = entry.completed ?? entry.done ?? entry.checked ?? entry.isDone ?? entry.isCompleted;
      const status = flag === true ? "completed" : normalizeTodoStatus(entry.status ?? entry.state ?? entry.phase);
      return { title: String(title ?? ""), status };
    }).filter((item) => item && item.title.trim()).slice(0, 50);
  }

  function todoProgress(items) {
    const list = Array.isArray(items) ? items : [];
    return { done: list.filter((i) => i.status === "completed").length, total: list.length };
  }


  function messageListStats(messages) {
    let hash = 2166136261;
    let bytes = 0;
    const add = (text) => {
      const value = String(text);
      bytes += value.length * 2;
      const sample = value.length > 131072
        ? `${value.slice(0, 32768)}\u0000${value.slice(value.length / 2, value.length / 2 + 32768)}\u0000${value.slice(-32768)}\u0000${value.length}`
        : value;
      for (let i = 0; i < sample.length; i++) {
        hash ^= sample.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    };
    const seen = new WeakSet();
    const visit = (value) => {
      if (value == null) return add(value);
      if (typeof value !== "object") return add(value);
      if (seen.has(value)) return add("[Circular]");
      seen.add(value);
      if (Array.isArray(value)) {
        add(`[${value.length}]`);
        for (const item of value) visit(item);
        return;
      }
      const keys = Object.keys(value).sort();
      add(`{${keys.length}}`);
      for (const key of keys) {
        add(key);
        visit(value[key]);
      }
    };
    visit(messages);
    return { revision: `${messages.length}:${(hash >>> 0).toString(36)}`, bytes };
  }
  // Chiusura animata di un pannello: applica la classe con l'animazione di
  // uscita e aggiunge .hidden solo alla fine (o subito con reduced-motion).
  // Se l'elemento viene riaperto durante l'uscita, _animCancel la interrompe.
  function animateOut(el, cls, ms = 260) {
    if (!el || el.classList.contains("hidden")) return Promise.resolve();
    if (el._animCancel) el._animCancel();
    return new Promise((resolve) => {
      let reduce = false;
      try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch {}
      if (reduce) { el.classList.add("hidden"); resolve(); return; }
      let finished = false;
      const cleanup = () => {
        clearTimeout(timer);
        el.removeEventListener("animationend", onEnd);
        el.classList.remove(cls);
        delete el._animCancel;
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        el.classList.add("hidden");
        cleanup();
        resolve();
      };
      const cancel = () => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      };
      const onEnd = (ev) => { if (ev.target === el) finish(); };
      el.addEventListener("animationend", onEnd);
      el._animCancel = cancel;
      el.classList.add(cls);
      const timer = setTimeout(finish, ms);
    });
  }

  const api = {
    escapeHtml,
    formatBytes,
    fmtCost,
    fmtTokens,
    speedMeta,
    cacheHitStats,
    basename,
    truncate,
    clipboardImageExtension,
    bufferToBase64,
    parsedToolArgs,
    fullToolArgs,
    changedLineCounts,
    compactProjectPath,
    stripAnsi,
    relTime,
    preferenceLabel,
    textOfBlocks,
    isActivityOnly,
    toolIconName,
    normalizeTodoStatus,
    parseTodoItems,
    todoProgress,
    messageListStats,
    animateOut,
  };

  root.piUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
