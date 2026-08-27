"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function defaultSessionsDir() {
  return path.join(os.homedir(), ".pi", "agent", "sessions");
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function firstUserText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const t = content.find((c) => c && c.type === "text" && typeof c.text === "string");
    if (t) return t.text;
  }
  return null;
}

// Cache of parsed session metadata keyed by file path. An entry is valid
// while mtime+size are unchanged, so repeated listings stay cheap even with
// thousands of sessions on disk.
const sessionMetaCache = new Map(); // file -> { mtimeMs, size, parsed }
const sessionMessagesCache = new Map(); // file -> { mtimeMs, size, messages }

function readSessionMessagesCached(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return [];
  }
  const cached = sessionMessagesCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.messages;
  const messages = readSessionMessages(file).messages;
  if (sessionMessagesCache.size > 24) sessionMessagesCache.clear();
  sessionMessagesCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, messages });
  return messages;
}

/**
 * Parse one session file. Only reads the header plus a bounded number of
 * lines to extract title/preview; large sessions stay cheap to list.
 */
function parseSessionFile(file, stat = null) {
  let st = stat;
  if (!st) {
    try {
      st = fs.statSync(file);
    } catch {
      return null;
    }
  }
  const cached = sessionMetaCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.parsed;
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const size = st.size;
    // Header line.
    const headBuf = Buffer.alloc(Math.min(4096, size));
    fs.readSync(fd, headBuf, 0, headBuf.length, 0);
    const nl = headBuf.indexOf("\n");
    const headerLine = (nl === -1 ? headBuf.toString("utf8") : headBuf.slice(0, nl).toString("utf8")).trim();
    let header = {};
    try {
      header = JSON.parse(headerLine);
    } catch {
      return null;
    }
    if (header.type !== "session") return null;

    // Scan up to ~64KB of entries for a display name and first user message.
    const scanLen = Math.min(65536, Math.max(0, size - (nl === -1 ? headBuf.length : nl + 1)));
    const scanBuf = Buffer.alloc(scanLen);
    let scanned = "";
    if (scanLen > 0) {
      fs.readSync(fd, scanBuf, 0, scanLen, nl === -1 ? headBuf.length : nl + 1);
      scanned = scanBuf.toString("utf8");
    }

    let name = null;
    let preview = null;
    let cwd = header.cwd || null;
    const preference = {};
    for (const line of scanned.split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!preview && entry.type === "message" && entry.message?.role === "user") {
        preview = truncate(firstUserText(entry.message.content)?.trim(), 160) || null;
      }
      if (!name && entry.type === "session_info" && entry.name) name = entry.name;
      if (entry.type === "model_change" && entry.provider && entry.modelId) {
        preference.provider = entry.provider;
        preference.modelId = entry.modelId;
      }
      if (entry.type === "thinking_level_change" && entry.thinkingLevel) {
        preference.thinkingLevel = entry.thinkingLevel;
      }
    }

    const parsed = {
      file,
      id: header.id || path.basename(file, ".jsonl"),
      version: header.version ?? 1,
      cwd,
      name: name || preview || "Nuova sessione",
      hasName: Boolean(name),
      preview,
      timestamp: header.timestamp || st.birthtime.toISOString(),
      modified: st.mtimeMs,
      size,
      preference: Object.keys(preference).length ? preference : null,
    };
    if (sessionMetaCache.size > 5000) sessionMetaCache.clear();
    sessionMetaCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, parsed });
    return parsed;
  } catch (err) {
    console.warn("[sessions] parse fallito:", file, err?.message || err);
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {}
  }
}

/** List all sessions across all projects, newest-modified first. */
function listSessions(sessionsDir = defaultSessionsDir()) {
  const out = [];
  let projectDirs = [];
  try {
    projectDirs = fs.readdirSync(sessionsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return out;
  }
  for (const dir of projectDirs) {
    const dirPath = path.join(sessionsDir, dir.name);
    let files = [];
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const filePath = path.join(dirPath, f);
      let st = null;
      try {
        st = fs.statSync(filePath);
      } catch {
        continue;
      }
      const parsed = parseSessionFile(filePath, st);
      if (parsed) out.push(parsed);
    }
  }
  out.sort((a, b) => b.modified - a.modified);
  return out;
}

function deleteSession(file) {
  fs.unlinkSync(file);
  sessionMetaCache.delete(file);
}

/** Read the currently selected branch directly from a Pi JSONL session. */
function readSessionMessages(file) {
  const entries = [];
  const byId = new Map();
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || entry.type === "session") continue;
    entries.push(entry);
    if (entry.id) byId.set(entry.id, entry);
  }

  const branch = [];
  const visited = new Set();
  let cursor = entries.length ? entries[entries.length - 1] : null;
  while (cursor && !visited.has(cursor.id)) {
    if (cursor.id) visited.add(cursor.id);
    branch.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  branch.reverse();
  const selected = branch.length ? branch : entries;
  const messages = [];
  for (const entry of selected) {
    if (entry.type === "message" && entry.message) {
      messages.push({ ...entry.message, timestamp: entry.message.timestamp || entry.timestamp });
    } else if (entry.type === "custom_message" && entry.display !== false) {
      messages.push({ role: "custom", content: entry.content || "", timestamp: entry.timestamp });
    }
  }
  return { messages };
}

function readSessionMessagesSlice(file, start, end) {
  const messages = readSessionMessagesCached(file);
  const from = Math.max(0, start | 0);
  const to = Math.min(messages.length, end | 0);
  if (to <= from) return [];
  return messages.slice(from, to);
}

function countSessionMessages(file) {
  return readSessionMessagesCached(file).length;
}

module.exports = {
  defaultSessionsDir,
  listSessions,
  parseSessionFile,
  readSessionMessages,
  readSessionMessagesSlice,
  countSessionMessages,
  deleteSession,
};
