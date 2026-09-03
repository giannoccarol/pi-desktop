"use strict";

// Endpoint web mobile via Tailscale: lista sessioni/progetti e continua le chat
// dal telefono. Solo stdlib (http), nessun'altra dipendenza.
// Sicurezza v1: token bearer su tailnet privata (non esporre su internet).
// ponytail: long-poll sul POST /api/prompt, niente websocket/SSE finché non serve.

const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");

let server = null;

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

// Pagina mobile single-file: lista sessioni, messaggi, composer. Token resta nel query param.
function mobileHtml() {
  return `<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta charset="utf8"><title>Pi Mobile</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:16px system-ui;background:#0f1115;color:#e8eaf0;display:flex;flex-direction:column;height:100dvh}header{padding:10px 12px;border-bottom:1px solid #222;display:flex;gap:8px;align-items:center}input,select,button,textarea{font:inherit;color:inherit;background:#1a1e26;border:1px solid #333;border-radius:10px;padding:10px}button{background:#2b6cb0;border-color:#2b6cb0;font-weight:600}#list{overflow:auto;flex:1}#list button{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #1c2029;border-radius:0;padding:12px}#list button.on{background:#1a2740}#list small{color:#9aa3b2;display:block;margin-top:4px}#msgs{overflow:auto;flex:1;padding:12px;display:none;flex-direction:column;gap:10px}.u{align-self:flex-end;background:#2b6cb0;border-radius:12px 12px 4px 12px;padding:10px;max-width:90%;white-space:pre-wrap}.a{align-self:flex-start;background:#1a1e26;border:1px solid #2a2f3a;border-radius:12px 12px 12px 4px;padding:10px;max-width:92%;white-space:pre-wrap}#composer{display:none;gap:8px;padding:10px;border-top:1px solid #222}#composer textarea{flex:1;resize:none}nav{display:flex;gap:8px}#view-chat{display:none;flex:1;flex-direction:column;min-height:0}#view-list{display:flex;flex:1;flex-direction:column;min-height:0}#q{flex:1}</style>
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
    \`<button data-f="\${encodeURIComponent(s.file)}" class="\${current===s.file?"on":""}"><b>\${esc(s.name||"Nuova sessione")}</b><small>\${esc((s.cwd||"").split("/").slice(-1)[0]||"")} · \${esc(s.preview||"").slice(0,90)}</small></button>\`).join("");
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
    \`<div class="\${m.role==="user"?"u":"a"}">\${esc(textOf(m)).slice(0,4000)}</div>\`).join("");
  $("msgs").scrollTop=1e9;
}
$("back").onclick=()=>{current=null;$("view-chat").style.display="none";$("view-list").style.display="flex";$("back").style.display="none";renderList()};
$("q").oninput=renderList;
$("send").onclick=async()=>{
  const t=$("text").value.trim();if(!t||busy||!current)return;busy=true;$("text").value="";
  $("msgs").insertAdjacentHTML("beforeend",\`<div class="u">\${esc(t)}</div>\`);$("msgs").scrollTop=1e9;
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
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(mobileHtml());
        return;
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
        const root = sessionsDir();
        const resolved = require("path").resolve(file);
        if (!resolved.startsWith(require("path").resolve(root) + require("path").sep)) return sendJson(res, 400, { error: "Percorso non valido" });
        const payload = sanitize(await sessionsAsync.readSessionMessages(resolved), 3000, 2000000);
        return sendJson(res, 200, payload);
      }
      if (req.method === "POST" && (url.pathname === "/api/prompt" || url.pathname === "/api/open")) {
        const body = await readBody(req);
        const file = typeof body.file === "string" && body.file ? body.file : null;
        if (file) {
          const open = runtime.list().find((t) => t.sessionFile === require("path").resolve(file));
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
        try { if (winSend(deps)) winSend(deps)("sessions:changed"); } catch {}
        return sendJson(res, 200, { ok: true, result: result ?? null });
      }
      if (req.method === "POST" && url.pathname === "/api/new") {
        const body = await readBody(req).catch(() => ({}));
        await ensureRuntime();
        const r = await runtime.newSession({ cwd: body.cwd || settings.cwd, sessionDir: sessionsDir() || undefined });
        return sendJson(res, 200, { ok: true, tabId: r?.tabId || null });
      }
      return sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      return sendJson(res, 500, { error: String(err?.message || err) });
    }
  });

  server.on("error", (err) => console.error("[mobile-web]", err.message));
  server.listen(port, "0.0.0.0", () => {
    const tip = tailscaleIp();
    console.log(`[mobile-web] attivo su porta ${port}`);
    console.log(`[mobile-web] da mobile (Tailscale): http://${tip || "<IP-TAILSCALE>"}:${port}/?token=${token}`);
    if (!tip) console.log("[mobile-web] IP non rilevato: vedi `tailscale ip -4` sul PC");
  });
  return server;
}

function winSend(deps) {
  return deps.notifySessionsChanged || null;
}

function stop() {
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

module.exports = { start, stop, restart, info, ensureToken };
