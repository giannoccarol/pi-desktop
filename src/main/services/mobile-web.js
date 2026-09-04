"use strict";

// Endpoint web per usare Pi Desktop da mobile via Tailscale. Solo stdlib.
// Due modalità:
//   /        -> la VERA UI desktop (stessi font, stili, progetti, chat) servita
//               come file statici + shim window.piDesktop su HTTP/SSE
//   /simple  -> pagina leggera di fallback (lista + prompt senza streaming)
// Sicurezza: token su tailnet privata (non esporre su internet).

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const RENDERER_DIR = path.join(__dirname, "..", "..", "renderer");

let server = null;
let keepAliveTimer = null;
const sseClients = new Set();

// method -> canale IPC (args posizionali identici al preload desktop)
const PASSTHROUGH = {
  getSettings: "settings:get",
  setSettings: "settings:set",
  mobileWebGet: "mobileWeb:get",
  mobileWebRegenerate: "mobileWeb:regenerateToken",
  getShellInfo: "app:getShellInfo",
  searchFiles: "fs:searchFiles",
  listDroppedFiles: "fs:listDropped",
  activateProject: "projects:activate",
  removeProject: "projects:remove",
  listSessions: "sessions:list",
  previewSession: "sessions:preview",
  messagesPage: "sessions:messagesPage",
  sessionMessageCount: "sessions:messageCount",
  messagesRange: "sessions:messagesRange",
  deleteSession: "sessions:delete",
  searchFullText: "sessions:searchFullText",
  bulkDeleteSessions: "sessions:bulkDelete",
  bulkExportSessions: "sessions:bulkExport",
  listTrash: "sessions:listTrash",
  restoreTrash: "sessions:restoreTrash",
  getSessionMeta: "sessions:getMeta",
  setSessionMeta: "sessions:setMeta",
  listExplorer: "fs:listExplorer",
  readTextFile: "fs:readTextFile",
  getPiLogs: "health:getPiLogs",
  start: "pi:start",
  listTabs: "pi:listTabs",
  activateTab: "pi:activateTab",
  closeTab: "pi:closeTab",
  prompt: "pi:prompt",
  steer: "pi:steer",
  followUp: "pi:followUp",
  abort: "pi:abort",
  forceStop: "pi:forceStop",
  newSession: "pi:newSession",
  openSession: "pi:openSession",
  getState: "pi:getState",
  getMessages: "pi:getMessages",
  getAvailableModels: "pi:getAvailableModels",
  setModel: "pi:setModel",
  setThinkingLevel: "pi:setThinkingLevel",
  getThinkingLevels: "pi:getThinkingLevels",
  getStats: "pi:getStats",
  getCommands: "pi:getCommands",
  getTree: "pi:getTree",
  getEntries: "pi:getEntries",
  getForkMessages: "pi:getForkMessages",
  fork: "pi:fork",
  clone: "pi:clone",
  getLastAssistantText: "pi:getLastAssistantText",
  setSessionName: "pi:setSessionName",
  compact: "pi:compact",
  setAutoCompaction: "pi:setAutoCompaction",
  setAutoRetry: "pi:setAutoRetry",
  abortRetry: "pi:abortRetry",
  setSteeringMode: "pi:setSteeringMode",
  setFollowUpMode: "pi:setFollowUpMode",
  bash: "pi:bash",
  abortBash: "pi:abortBash",
  uiRespond: "pi:uiRespond",
  getPiSettings: "piSettings:get",
  setPiSettings: "piSettings:set",
  setProjectTrust: "piSettings:setTrust",
  savePiSettings: "piSettings:save",
  getAppUpdateState: "update:getState",
  checkAppUpdate: "update:check",
  downloadAppUpdate: "update:download",
  installAppUpdate: "update:install",
  relaunchApp: "app:relaunch",
  updateStatus: "pi:updateStatus",
  maintenance: "pi:maintenance",
  listProviders: "providers:list",
  setProviderKey: "providers:setKey",
  removeProvider: "providers:remove",
  loginProvider: "providers:login",
  authRespond: "providers:authRespond",
  cancelProviderLogin: "providers:cancelLogin",
  getGitStatus: "git:getStatus",
  searchPackages: "packages:search",
  listInstalledPackages: "packages:listInstalled",
  listPackageResources: "packages:listResources",
  setPackageResourceEnabled: "packages:setResourceEnabled",
  installPackage: "packages:install",
  removePackage: "packages:remove",
  installPackageSource: "packages:installSource",
  removePackageSource: "packages:removeSource",
  updatePackages: "packages:update",
};

const EVENT_CHANNELS = ["pi:event", "pi:maintenance-output", "pi:package-output", "pi:auth-request", "pi:tray-new-chat", "update:state", "app:stale-install", "sessions:changed", "window:state"];

// Metodi senza senso headless: dialog nativi, finestre, terminale locale.
async function dispatch(deps, method, args) {
  switch (method) {
    case "pickDirectory": return null;
    case "pickFiles": return [];
    case "openExternal": return { ok: true };
    case "openTerminal": throw new Error("Terminale non disponibile da mobile");
    case "addProject": throw new Error("Aggiungi il progetto dal desktop");
    case "popOutTab": throw new Error("Pop-out non disponibile da mobile");
    case "minimizeWindow":
    case "toggleMaximizeWindow":
    case "closeWindow": return false;
    case "isMaximized": return false;
    case "exportHtml":
      if (!args[0]) throw new Error("Export da mobile: specifica un percorso");
      return deps.callIpc("pi:exportHtml", args);
    default: {
      const channel = PASSTHROUGH[method];
      if (!channel) throw new Error(`Metodo sconosciuto: ${method}`);
      return deps.callIpc(channel, args);
    }
  }
}

// Shim window.piDesktop: stesse firme del preload, via fetch + un EventSource.
function shimJs() {
  const methods = [...Object.keys(PASSTHROUGH),
    "pickDirectory", "pickFiles", "openExternal", "openTerminal", "addProject",
    "popOutTab", "minimizeWindow", "toggleMaximizeWindow", "closeWindow",
    "isMaximized", "exportHtml"];
  const fns = methods.map((m) => `  ${m}(...a){return call(${JSON.stringify(m)},a);}`).join("\n");
  return `"use strict";
(function(){
const token=new URLSearchParams(location.search).get("token")||"";
function call(method,args){
  return fetch("/api/call?token="+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})})
    .then(async(r)=>{const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error((j&&j.error)||("HTTP "+r.status));return j.data;});
}
let es=null;const subs=new Map();
function ensureEs(){
  if(es)return;
  es=new EventSource("/api/events?token="+encodeURIComponent(token));
  es.onmessage=(ev)=>{try{const m=JSON.parse(ev.data);const set=subs.get(m.channel);if(set)set.forEach((cb)=>{try{cb(m.payload)}catch{}});}catch{}};
}
window.piDesktop={
${fns}
  on(channel,cb){
    if(!${JSON.stringify(EVENT_CHANNELS)}.includes(channel))return ()=>{};
    ensureEs();
    let set=subs.get(channel);if(!set){set=new Set();subs.set(channel,set);}
    set.add(cb);
    return ()=>{set.delete(cb);};
  }
};
})();`;
}

function broadcast(channel, payload) {
  if (!sseClients.size) return;
  let line = null;
  for (const res of sseClients) {
    try {
      if (!line) line = `data: ${JSON.stringify({ channel, payload })}\n\n`;
      res.write(line);
    } catch {
      sseClients.delete(res);
    }
  }
}

function tailscaleIp() {
  try {
    const out = execSync("tailscale ip -4", { timeout: 3000, encoding: "utf8" }).trim().split("\n")[0].trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(out)) return out;
  } catch {}
  return null;
}

function ensureToken(settings, saveSettings) {
  if (typeof settings.mobileWebToken === "string" && settings.mobileWebToken.length >= 16) return settings.mobileWebToken;
  const token = crypto.randomBytes(24).toString("hex");
  settings.mobileWebToken = token;
  try { saveSettings(); } catch {}
  return token;
}

function isAuthed(req, url, token) {
  const h = String(req.headers.authorization || "");
  if (h === `Bearer ${token}`) return true;
  if (url.searchParams.get("token") === token) return true;
  return false;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Body troppo grande")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("JSON non valido")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json",
};

let appHtmlCache = null;
function appHtml() {
  if (appHtmlCache) return appHtmlCache;
  let html = fs.readFileSync(path.join(RENDERER_DIR, "index.html"), "utf8");
  // La CSP desktop vieta le connessioni: sul web servono fetch/SSE same-origin.
  html = html.replace("connect-src 'none'", "connect-src 'self'");
  // Shim prima di ogni altro script: bootstrap.js legge window.piDesktop al load.
  html = html.replace('<script src="../../node_modules/lucide/dist/umd/lucide.min.js">',
    '<script src="/shim.js">\n  <script src="../../node_modules/lucide/dist/umd/lucide.min.js">');
  appHtmlCache = html;
  return html;
}

function serveStatic(urlPath, res) {
  if (urlPath === "/node_modules/lucide/dist/umd/lucide.min.js") {
    const p = path.join(RENDERER_DIR, "..", "..", "node_modules", "lucide", "dist", "umd", "lucide.min.js");
    try {
      const data = fs.readFileSync(p);
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600" });
      res.end(data);
    } catch {
      res.writeHead(404); res.end();
    }
    return true;
  }
  let rel = "";
  try { rel = decodeURIComponent(urlPath).replace(/^\/+/, ""); } catch { return false; }
  if (!rel || rel.includes("\0")) return false;
  const abs = path.normalize(path.join(RENDERER_DIR, rel));
  if (abs !== RENDERER_DIR && !abs.startsWith(RENDERER_DIR + path.sep)) return false;
  const ext = path.extname(abs).toLowerCase();
  if (!MIME[ext]) return false;
  try {
    if (fs.statSync(abs).isDirectory()) return false;
    res.writeHead(200, { "content-type": MIME[ext], "cache-control": "public, max-age=3600" });
    res.end(fs.readFileSync(abs));
    return true;
  } catch {
    return false;
  }
}

// Pagina leggera di fallback (niente streaming): /simple
function mobileHtml() {
  return `<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta charset="utf8"><title>Pi Mobile</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:16px system-ui;background:#0f1115;color:#e8eaf0;display:flex;flex-direction:column;height:100dvh}header{padding:10px 12px;border-bottom:1px solid #222;display:flex;gap:8px;align-items:center}input,button,textarea{font:inherit;color:inherit;background:#1a1e26;border:1px solid #333;border-radius:10px;padding:10px}button{background:#2b6cb0;border-color:#2b6cb0;font-weight:600}#list{overflow:auto;flex:1}#list button{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #1c2029;border-radius:0;padding:12px}#list small{color:#9aa3b2;display:block;margin-top:4px}#msgs{overflow:auto;flex:1;padding:12px;display:none;flex-direction:column;gap:10px}.u{align-self:flex-end;background:#2b6cb0;border-radius:12px 12px 4px 12px;padding:10px;max-width:90%;white-space:pre-wrap}.a{align-self:flex-start;background:#1a1e26;border:1px solid #2a2f3a;border-radius:12px 12px 12px 4px;padding:10px;max-width:92%;white-space:pre-wrap}#composer{display:none;gap:8px;padding:10px;border-top:1px solid #222}#composer textarea{flex:1;resize:none}#view-chat{display:none;flex:1;flex-direction:column;min-height:0}#view-list{display:flex;flex:1;flex-direction:column;min-height:0}#q{flex:1}</style>
<header><button id="back" style="display:none">←</button><b>Pi</b><input id="q" placeholder="Cerca sessioni…"></header>
<div id="view-list"><div id="list"></div></div>
<div id="view-chat"><div id="msgs"></div><div id="composer"><textarea id="text" rows="2" placeholder="Scrivi…"></textarea><button id="send">➤</button></div></div>
<script>
const token=new URLSearchParams(location.search).get("token")||"";
const api=(p,o={})=>fetch(p+(p.includes("?")?"&":"?")+"token="+encodeURIComponent(token),o).then(async r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()});
let sessions=[],current=null,busy=false;
const $=id=>document.getElementById(id);
function renderList(){
  const q=$("q").value.toLowerCase();
  $("list").innerHTML=sessions.filter(s=>(s.name+" "+(s.preview||"")+" "+(s.cwd||"")).toLowerCase().includes(q)).slice(0,200).map(s=>
    '<button data-f="'+encodeURIComponent(s.file)+'"><b>'+esc(s.name||"Nuova sessione")+'</b><small>'+esc((s.cwd||"").split("/").slice(-1)[0]||"")+" · "+esc(s.preview||"").slice(0,90)+"</small></button>").join("");
  document.querySelectorAll("#list button").forEach(b=>b.onclick=()=>openChat(decodeURIComponent(b.dataset.f)));
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function textOf(m){const c=m.content;if(typeof c==="string")return c;if(Array.isArray(c))return c.map(b=>b.text||"[img]").join("");return ""}
async function openChat(file){
  current=file;$("view-list").style.display="none";$("view-chat").style.display="flex";$("back").style.display="";
  $("msgs").style.display="flex";$("composer").style.display="flex";renderList();await reload();
}
async function reload(){
  if(!current)return;
  const d=await api("/api/messages?file="+encodeURIComponent(current));
  $("msgs").innerHTML=(d.messages||[]).filter(m=>m.role==="user"||m.role==="assistant").slice(-100).map(m=>
    '<div class="'+(m.role==="user"?"u":"a")+'">'+esc(textOf(m)).slice(0,4000)+"</div>").join("");
  $("msgs").scrollTop=1e9;
}
$("back").onclick=()=>{current=null;$("view-chat").style.display="none";$("view-list").style.display="flex";$("back").style.display="none";renderList()};
$("q").oninput=renderList;
$("send").onclick=async()=>{
  const t=$("text").value.trim();if(!t||busy||!current)return;busy=true;$("text").value="";
  $("msgs").insertAdjacentHTML("beforeend",'<div class="u">'+esc(t)+"</div>");$("msgs").scrollTop=1e9;
  try{await api("/api/prompt",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({file:current,message:t})});await reload()}
  catch(e){alert("Errore: "+e.message)}busy=false;
};
api("/api/sessions").then(d=>{sessions=d.sessions||[];renderList()}).catch(()=>{document.body.innerHTML="<p style=padding:20px>401: apri con ?token=… (lo trovi nei log o in Impostazioni)</p>"});
</script>`;
}

function start(deps) {
  const { settings, saveSettings, sessionsDir, sessionsAsync, sanitize, runtime, ensureRuntime } = deps;
  if (!settings.mobileWebEnabled) return null;
  if (server) return server;
  const token = ensureToken(settings, saveSettings);
  const port = Math.max(1024, Math.min(65535, Number(settings.mobileWebPort) || 3923));

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://x");
      if (!isAuthed(req, url, token)) {
        res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        res.end("401: serve ?token=… (vedi log avvio o Impostazioni)");
        return;
      }
      // UI desktop completa: stessa grafica, font, progetti e chat del PC.
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(appHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/simple") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(mobileHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/shim.js") {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        res.end(shimJs());
        return;
      }
      // Eventi live (streaming chat, gericht): un EventSource per tab browser.
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        res.write(":ok\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }
      // Bridge generico: ogni metodo window.piDesktop via HTTP.
      if (req.method === "POST" && url.pathname === "/api/call") {
        const body = await readBody(req);
        if (!body || typeof body.method !== "string") return sendJson(res, 400, { ok: false, error: "method mancante" });
        const args = Array.isArray(body.args) ? body.args : [];
        try {
          const data = await dispatch(deps, body.method, args);
          return sendJson(res, 200, { ok: true, data: data ?? null });
        } catch (err) {
          return sendJson(res, 200, { ok: false, error: String(err?.message || err) });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return sendJson(res, 200, { ok: true, cwd: settings.cwd, projects: settings.projects, sessionsDir: sessionsDir() });
      }
      if (req.method === "GET" && url.pathname === "/api/sessions") {
        const listed = (await sessionsAsync.listSessions(sessionsDir())).map((s) => ({
          ...s,
          preference: { ...(s.preference || {}), ...(settings.sessionPreferences?.[s.file] || {}) },
        }));
        return sendJson(res, 200, { sessions: listed });
      }
      if (req.method === "GET" && url.pathname === "/api/messages") {
        const file = String(url.searchParams.get("file") || "");
        const resolved = path.resolve(file);
        if (!resolved.startsWith(path.resolve(sessionsDir()) + path.sep)) return sendJson(res, 400, { error: "Percorso non valido" });
        const payload = sanitize(await sessionsAsync.readSessionMessages(resolved), 3000, 2000000);
        return sendJson(res, 200, payload);
      }
      if (req.method === "POST" && (url.pathname === "/api/prompt" || url.pathname === "/api/open")) {
        const body = await readBody(req);
        const file = typeof body.file === "string" && body.file ? body.file : null;
        if (file) {
          const open = runtime.list().find((t) => t.sessionFile === path.resolve(file));
          if (!open) await runtime.openSession(file, { cwd: settings.cwd, sessionDir: sessionsDir() || undefined });
          else runtime.activate(open.id);
        }
        if (url.pathname === "/api/open" || !body.message) {
          const tabs = runtime.list();
          return sendJson(res, 200, { ok: true, tabs: tabs.map((t) => ({ id: t.id, title: t.title, sessionFile: t.sessionFile })) });
        }
        await ensureRuntime();
        const active = runtime.list().find((t) => t.active);
        const result = await runtime.prompt(String(body.message), undefined, undefined, active?.id);
        try { deps.notifySessionsChanged(); } catch {}
        return sendJson(res, 200, { ok: true, result: result ?? null });
      }
      if (req.method === "POST" && url.pathname === "/api/new") {
        const body = await readBody(req).catch(() => ({}));
        await ensureRuntime();
        const r = await runtime.newSession({ cwd: body.cwd || settings.cwd, sessionDir: sessionsDir() || undefined });
        return sendJson(res, 200, { ok: true, tabId: r?.tabId || null });
      }
      if (req.method === "GET" && serveStatic(url.pathname, res)) return;
      return sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      return sendJson(res, 500, { error: String(err?.message || err) });
    }
  });

  server.on("error", (err) => console.error("[mobile-web]", err.message));
  keepAliveTimer = setInterval(() => {
    for (const res of sseClients) {
      try { res.write(":ping\n\n"); } catch { sseClients.delete(res); }
    }
  }, 25000);
  keepAliveTimer.unref?.();
  server.listen(port, "0.0.0.0", () => {
    const tip = tailscaleIp();
    console.log(`[mobile-web] attivo su porta ${port}`);
    console.log(`[mobile-web] da mobile (Tailscale): http://${tip || "<IP-TAILSCALE>"}:${port}/?token=${token}`);
    if (!tip) console.log("[mobile-web] IP non rilevato: vedi `tailscale ip -4` sul PC");
  });
  return server;
}

function stop() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  for (const res of sseClients) { try { res.end(); } catch {} }
  sseClients.clear();
  appHtmlCache = null;
  if (!server) return;
  try { server.close(); } catch {}
  server = null;
}

function restart(deps) {
  stop();
  if (deps.settings.mobileWebEnabled) return start(deps);
  return null;
}

function lanIp() {
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const nic of list || []) {
        if (nic && nic.family === "IPv4" && !nic.internal && nic.address) return nic.address;
      }
    }
  } catch {}
  return null;
}

function info(settings) {
  const tip = tailscaleIp();
  const lan = lanIp();
  const port = Number(settings.mobileWebPort) || 3923;
  const token = settings.mobileWebToken || "";
  const host = tip || lan;
  return {
    enabled: Boolean(settings.mobileWebEnabled),
    port,
    running: Boolean(server),
    tailscaleIp: tip,
    lanIp: lan,
    url: host && token ? `http://${host}:${port}/?token=${token}` : null,
  };
}

module.exports = { start, stop, restart, info, ensureToken, broadcast };
