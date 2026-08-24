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

/**
 * Parse one session file. Only reads the header plus a bounded number of
 * lines to extract title/preview; large sessions stay cheap to list.
 */
function parseSessionFile(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
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

    const stat = fs.statSync(file);
    return {
      file,
      id: header.id || path.basename(file, ".jsonl"),
      version: header.version ?? 1,
      cwd,
      name: name || preview || "Nuova sessione",
      hasName: Boolean(name),
      preview,
      timestamp: header.timestamp || stat.birthtime.toISOString(),
      modified: stat.mtimeMs,
      size,
      preference: Object.keys(preference).length ? preference : null,
    };
  } catch {
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
      const parsed = parseSessionFile(path.join(dirPath, f));
      if (parsed) out.push(parsed);
    }
  }
  out.sort((a, b) => b.modified - a.modified);
  return out;
}

function deleteSession(file) {
  fs.unlinkSync(file);
}

module.exports = { defaultSessionsDir, listSessions, parseSessionFile, deleteSession };
