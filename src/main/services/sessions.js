"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// pi-subagents prepends this stable sentence to forked worker prompts. Older
// releases could leave those fork files beside normal sessions on Windows,
// where they were then mistaken for user chats by the desktop sidebar.
const DELEGATED_AGENT_MARKER = "You are a delegated subagent running from a fork of the parent session.";

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
const SESSION_MESSAGES_CACHE_MAX_BYTES = 64 * 1024 * 1024;
let sessionMessagesCacheBytes = 0;
function dropMessagesCache(file){
  const cached=sessionMessagesCache.get(file);
  if(cached) sessionMessagesCacheBytes=Math.max(0,sessionMessagesCacheBytes-cached.size);
  sessionMessagesCache.delete(file);
}
function trimMessagesCache(){
  while(sessionMessagesCacheBytes>SESSION_MESSAGES_CACHE_MAX_BYTES && sessionMessagesCache.size>1){
    dropMessagesCache(sessionMessagesCache.keys().next().value);
  }
}

function sessionFacts(file, header = {}) {
  const total = { input:0, output:0, cacheRead:0, cacheWrite:0, total:0, cost:0 };
  const headerTimestamp = Date.parse(header.timestamp || "");
  const inspectFork = Boolean(header.parentSession);
  let delegatedAgent = false;
  let inheritedEntries = false;
  let ownUserActivity = false;
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(256 * 1024);
    let carry = "";
    let bytes = 0;
    const consume = (line)=>{
      if(inspectFork && line.includes(DELEGATED_AGENT_MARKER)) delegatedAgent = true;
      if(!line.includes('"usage"') && !(inspectFork && line.includes('"timestamp"'))) return;
      try{
        const entry=JSON.parse(line);
        if(inspectFork && Number.isFinite(headerTimestamp)){
          const entryTimestamp = Date.parse(entry?.timestamp || "");
          if(Number.isFinite(entryTimestamp)){
            if(entryTimestamp < headerTimestamp) inheritedEntries = true;
            else if(entry.type === "message" && entry.message?.role === "user") ownUserActivity = true;
          }
        }
        const usage=entry?.message?.usage;
        if(!usage) return;
        total.input += Number(usage.input) || 0;
        total.output += Number(usage.output) || 0;
        total.cacheRead += Number(usage.cacheRead) || 0;
        total.cacheWrite += Number(usage.cacheWrite) || 0;
        total.total += Number(usage.totalTokens) || 0;
        total.cost += Number(usage.cost?.total) || 0;
      }catch{}
    };
    while((bytes=fs.readSync(fd, buffer, 0, buffer.length, null))>0){
      const chunk=carry+buffer.toString("utf8",0,bytes);
      const lines=chunk.split("\n");
      carry=lines.pop() || "";
      for(const line of lines) consume(line);
    }
    if(carry) consume(carry);
  }catch{} finally { if(fd!==undefined) try{ fs.closeSync(fd); }catch{} }
  return { usage:total, delegatedAgent, inheritedEntries, ownUserActivity };
}

function readSessionMessagesCached(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return [];
  }
  const cached = sessionMessagesCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size){
    sessionMessagesCache.delete(file); sessionMessagesCache.set(file,cached);
    return cached.messages;
  }
  dropMessagesCache(file);
  const messages = readSessionMessages(file).messages;
  sessionMessagesCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, messages });
  sessionMessagesCacheBytes+=st.size;
  trimMessagesCache();
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

    const facts = sessionFacts(file, header);
    const usage = facts.usage;
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
      parentSession: header.parentSession || null,
      isDelegatedAgent: facts.delegatedAgent,
      isInheritedFork: facts.inheritedEntries,
      hasOwnUserActivity: facts.ownUserActivity,
      preference: Object.keys(preference).length ? preference : null,
      cost: usage.cost,
      tokens: { input:usage.input, output:usage.output, cacheRead:usage.cacheRead, cacheWrite:usage.cacheWrite, total:usage.total },
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
      // Forked workers are implementation details, not user chats. While a
      // just-created inherited fork is still waiting for its worker prompt,
      // keep it out too so fs.watch cannot make it flash in and out. A normal
      // user fork becomes visible as soon as the user sends its first message.
      if (parsed && !parsed.isDelegatedAgent && (!parsed.isInheritedFork || parsed.hasOwnUserActivity)) out.push(parsed);
    }
  }
  out.sort((a, b) => b.modified - a.modified);
  return out;
}

function deleteSession(file) {
  fs.unlinkSync(file);
  sessionMetaCache.delete(file);
  dropMessagesCache(file);
}

function searchSessionsFullText(sessionsDirPath, query, maxResults = 80) {
  const options = query && typeof query === "object" ? query : { query };
  const needle = String(options.query || "").trim().toLowerCase();
  let matcher = null;
  if (options.pattern && String(options.pattern).length <= 200) {
    try { matcher = new RegExp(String(options.pattern), String(options.flags || "i").replace(/[^imsu]/g, "")); } catch {}
  }
  if (!needle && !matcher) return [];
  const sessions = listSessions(sessionsDirPath);
  const results = [];
  for (const session of sessions) {
    if (results.length >= maxResults) break;
    const nameHit = matcher ? matcher.test(session.name || "") : (session.name || "").toLowerCase().includes(needle);
    if (matcher) matcher.lastIndex = 0;
    const previewHit = matcher ? matcher.test(session.preview || "") : (session.preview || "").toLowerCase().includes(needle);
    if (matcher) matcher.lastIndex = 0;
    if (nameHit || previewHit) {
      results.push({ ...session, matchReason: nameHit ? "name" : "preview" });
      continue;
    }
    // scan full content via cached messages, bounded scan
    try {
      const msgs = readSessionMessagesCached(session.file);
      let hitSnippet = null;
      for (const msg of msgs) {
        const text = typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? msg.content.map((b) => b.text || "").join(" ") : "";
        const match = matcher ? matcher.exec(text) : null;
        const idx = matcher ? (match ? match.index : -1) : text.toLowerCase().indexOf(needle);
        if (matcher) matcher.lastIndex = 0;
        if (idx !== -1) {
          const start = Math.max(0, idx - 60);
          hitSnippet = truncate(text.slice(start, start + 160).replace(/\s+/g, " ").trim(), 160);
          break;
        }
      }
      if (hitSnippet) results.push({ ...session, matchReason: "content", snippet: hitSnippet });
    } catch {}
  }
  return results;
}

function trashDirFor(sessionsDirPath){ return path.join(path.resolve(sessionsDirPath), ".trash"); }
function trashMetaPath(trashPath){ return `${trashPath}.meta.json`; }
function bulkDeleteSessions(files, sessionsDirPath) {
  let deleted = 0;
  const errors = [];
  const trashDir = trashDirFor(sessionsDirPath);
  try{ fs.mkdirSync(trashDir, {recursive:true}); }catch{}
  for (const file of files) {
    try {
      const resolved = path.resolve(String(file));
      const root = path.resolve(sessionsDirPath);
      if (!resolved.startsWith(root + path.sep) || !resolved.endsWith(".jsonl")) throw new Error("percorso non valido");
      const trashPath = path.join(trashDir, `${Date.now()}-${crypto.randomUUID()}.jsonl`);
      const relativePath = path.relative(root, resolved);
      fs.writeFileSync(trashMetaPath(trashPath), JSON.stringify({ relativePath, deletedAt: Date.now() }), { encoding: "utf8", mode: 0o600 });
      try{ fs.renameSync(resolved, trashPath); }catch{ fs.copyFileSync(resolved, trashPath); fs.unlinkSync(resolved); }
      sessionMetaCache.delete(resolved); dropMessagesCache(resolved);
      deleted++;
    } catch (err) { errors.push({ file, error: err.message }); }
  }
  // prune trash >30 days
  try{
    const entries = fs.readdirSync(trashDir);
    const now = Date.now();
    for(const e of entries){
      try{
        const entryPath = path.join(trashDir,e);
        const st=fs.statSync(entryPath);
        if(now - st.mtimeMs > 30*24*3600*1000){
          fs.unlinkSync(entryPath);
          if(e.endsWith(".jsonl")) try{ fs.unlinkSync(trashMetaPath(entryPath)); }catch{}
        }
      }catch{}
    }
  }catch{}
  return { deleted, errors };
}
function restoreFromTrash(sessionsDirPath, trashFile){
  const trashDir = trashDirFor(sessionsDirPath);
  const src = path.join(trashDir, path.basename(String(trashFile)));
  const root = path.resolve(sessionsDirPath);
  if(!src.startsWith(trashDir + path.sep) || !fs.existsSync(src)) throw new Error("File trash non trovato");
  let relativePath = "";
  try{ relativePath = String(JSON.parse(fs.readFileSync(trashMetaPath(src), "utf8")).relativePath || ""); }catch{}
  if(!relativePath || path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`)){
    const originalName = path.basename(src).replace(/^\d+-/, "");
    const fallbackDir = fs.readdirSync(root, {withFileTypes:true}).find((entry)=> entry.isDirectory() && entry.name !== ".trash");
    if(!fallbackDir) throw new Error("Destinazione originale non disponibile");
    relativePath = path.join(fallbackDir.name, originalName);
  }
  let dest = path.resolve(root, relativePath);
  if(!dest.startsWith(root + path.sep)) throw new Error("Destinazione di ripristino non valida");
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  if(fs.existsSync(dest)){
    const ext = path.extname(dest);
    dest = `${dest.slice(0, -ext.length)}-restored-${Date.now()}${ext}`;
  }
  fs.renameSync(src, dest);
  try{ fs.unlinkSync(trashMetaPath(src)); }catch{}
  return dest;
}

function listExplorerTree(cwd, depth = 2, maxEntries = 600, options = {}) {
  const out = [];
  const root = fs.realpathSync(path.resolve(cwd));
  const visited = new Set([root]);
  function walk(dir, relBase, currentDepth) {
    if (currentDepth > depth || out.length >= maxEntries) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      if ((!options.showDotfiles && e.name.startsWith(".")) || e.name === "node_modules" || e.name === "__pycache__") continue;
      const abs = path.join(dir, e.name);
      const rel = relBase ? path.join(relBase, e.name) : e.name;
      let size = 0;
      let isDir = e.isDirectory();
      try {
        const real = fs.realpathSync(abs);
        if(real!==root && !real.startsWith(root+path.sep)) continue;
        const st = fs.statSync(real); size = st.size; isDir = st.isDirectory();
        if(isDir && visited.has(real)) continue;
        if(isDir) visited.add(real);
      } catch { continue; }
      out.push({ name: e.name, path: abs, rel, isDirectory: isDir, size, isSymlink:e.isSymbolicLink() });
      if (out.length >= maxEntries) return;
      if (isDir && currentDepth < depth) walk(abs, rel, currentDepth + 1);
    }
  }
  try { if (fs.statSync(cwd).isDirectory()) walk(path.resolve(cwd), "", 0); } catch {}
  return out.slice(0, maxEntries);
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
  searchSessionsFullText,
  bulkDeleteSessions,
  trashDirFor,
  restoreFromTrash,
  listExplorerTree,
};
