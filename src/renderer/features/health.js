"use strict";
(function exposeHealth(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  let levelFilter = "all"; // all | error | warn
  let streamBuffer = [];
  let streamEnabled = true;

  async function refresh(){
    try{
      const res = await api().getPiLogs();
      const logs = res?.logs || [];
      if(logs.length){
        // categorize
        const last = logs.slice(-1)[0] || null;
        if(last && /error|fail|exit/i.test(last)) state().healthBanner = last;
        streamBuffer = logs.slice(-200);
      }
      renderBanner();
      if(currentDialogPre) updateDialog();
      return logs;
    }catch{ return []; }
  }
  function levelOf(line){
    const l = String(line).toLowerCase();
    if(l.includes("error")||l.includes("fail")||l.includes("exit code")) return "error";
    if(l.includes("warn")||l.includes("retry")||l.includes("truncat")) return "warn";
    return "info";
  }
  function filteredLogs(){
    if(levelFilter==="all") return streamBuffer;
    return streamBuffer.filter(l=> levelOf(l)===levelFilter);
  }
  function renderBanner(){
    const e = el(); const s = state();
    const banner = e.healthBanner;
    if(!banner) return;
    const msg = s.healthBanner;
    if(!msg){
      banner.classList.add("hidden");
      return;
    }
    const textEl = document.getElementById("health-banner-text");
    if(textEl) textEl.textContent = String(msg).slice(0, 220);
    // add level color
    const lvl = levelOf(msg);
    banner.style.borderLeft = lvl==="error" ? "3px solid var(--red)" : lvl==="warn" ? "3px solid var(--amber)" : "3px solid var(--blue)";
    banner.classList.remove("hidden");
    root.piUi?.refreshIcons?.(banner);
  }
  let currentDialogPre = null;
  let currentDialog = null;
  function updateDialog(){
    if(!currentDialogPre) return;
    const logs = filteredLogs();
    currentDialogPre.textContent = logs.join("\n") || "(nessun log per filtro)";
    const countEl = currentDialog?.querySelector("#log-count");
    if(countEl) countEl.textContent = `${logs.length} righe · ${streamBuffer.length} totali`;
  }
  async function showLogDialog(){
    const logs = await refresh();
    const dlg = document.createElement("dialog");
    currentDialog = dlg;
    dlg.style.cssText = "max-width:780px;width:94vw";
    dlg.innerHTML = `<div class="modal-body" style="display:flex;flex-direction:column;max-height:80vh"><div class="modal-title-row"><span class="modal-icon"><i data-lucide="scroll-text"></i></span><div class="grow"><h2>Log Pi</h2><p class="muted small">Streaming realtime + filtri</p></div><button class="icon-btn borderless" data-close><i data-lucide="x"></i></button></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <span id="log-count" class="muted small">${logs.length} righe</span><span class="flex-spacer"></span>
        <select id="log-level" style="height:28px;border-radius:7px;font-size:11px"><option value="all">Tutti</option><option value="error">Errori</option><option value="warn">Warning</option></select>
        <label style="display:flex;gap:4px;align-items:center;font-size:11px"><input id="log-stream" type="checkbox" checked> streaming</label>
        <button id="log-copy" class="btn ghost small" style="height:28px">Copia</button>
        <button id="log-export" class="btn ghost small" style="height:28px">Esporta</button>
        <button id="log-restart" class="btn ghost small" style="height:28px;color:var(--red)">Restart runtime</button>
      </div>
      <pre style="flex:1;overflow:auto;background:var(--surface-2);padding:10px;border-radius:8px;font:11px var(--mono);white-space:pre-wrap;max-height:420px;margin:0"></pre>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px"><span class="muted small" style="align-self:center">Auto-aggiorna ogni 3s</span><button class="btn ghost" data-close>Chiudi</button></div></div>`;
    const pre = dlg.querySelector("pre");
    currentDialogPre = pre;
    const lvlSel = dlg.querySelector("#log-level");
    lvlSel.value = levelFilter;
    lvlSel.addEventListener("change", ()=>{ levelFilter = lvlSel.value; updateDialog(); });
    dlg.querySelector("#log-stream").addEventListener("change", (ev)=>{ streamEnabled = ev.target.checked; });
    dlg.querySelector("#log-copy").addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText(filteredLogs().join("\n")); toast("Log copiati","info"); }catch{}
    });
    dlg.querySelector("#log-export").addEventListener("click", ()=>{
      const blob = new Blob([filteredLogs().join("\n")], {type:"text/plain"});
      const url = URL.createObjectURL(blob);
      const a=document.createElement("a"); a.href=url; a.download=`pi-logs-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url);
    });
    dlg.querySelector("#log-restart").addEventListener("click", async ()=>{
      try{ await api().forceStop?.(); toast("Runtime riavviato","info"); }catch(err){ toast(err.message,"error"); }
    });
    dlg.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", ()=> dlg.close()));
    dlg.addEventListener("close", ()=>{ currentDialogPre=null; currentDialog=null; dlg.remove(); });
    updateDialog();
    // realtime polling while open
    const iv = setInterval(async ()=>{
      if(!dlg.isConnected || !streamEnabled) return;
      await refresh();
    }, 3000);
    dlg.addEventListener("close", ()=> clearInterval(iv));
    if(api.on){
      const h = (msg)=>{
        if(!dlg.isConnected || !streamEnabled) return;
        if(msg?.type==="pi-exit" || msg?.type==="auto_retry_start" || msg?.type==="tool_execution_update"){
          streamBuffer.push(`[${new Date().toISOString().slice(11,19)}] ${msg.type} ${JSON.stringify(msg).slice(0,200)}`);
          if(streamBuffer.length>300) streamBuffer.splice(0,100);
          updateDialog();
        }
      };
      api.on("pi:event", h);
      dlg.addEventListener("close", ()=>{ try{ api.on("pi:event", ()=>{}); }catch{} });
    }
    document.body.appendChild(dlg);
    dlg.showModal();
    root.piUi?.refreshIcons?.(dlg);
  }
  function init(){
    const e = el();
    e.healthLogBtn?.addEventListener("click", showLogDialog);
    setInterval(refresh, 15000);
    // also listen for maintenance output streaming
    if(api.on){
      api.on("pi:maintenance-output", (line)=>{
        if(!streamEnabled) return;
        streamBuffer.push(String(line).slice(0,500));
        if(streamBuffer.length>400) streamBuffer.splice(0,150);
        if(currentDialogPre) updateDialog();
        // also show banner for errors
        if(/error|fail/i.test(String(line))) { state().healthBanner = String(line).slice(0,220); renderBanner(); }
      });
    }
  }
  root.piHealth = { refresh, renderBanner, showLogDialog, init };
})(typeof window!=="undefined"?window:globalThis);
