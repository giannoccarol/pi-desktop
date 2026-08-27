"use strict";
(function exposeHealth(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  async function refresh(){
    try{
      const res = await api().getPiLogs();
      const logs = res?.logs || [];
      if(logs.length){
        state().healthBanner = logs.slice(-1)[0] || null;
      }
      renderBanner();
      return logs;
    }catch{ return []; }
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
    // show only if recent error-ish
    const textEl = document.getElementById("health-banner-text");
    if(textEl) textEl.textContent = String(msg).slice(0, 200);
    banner.classList.remove("hidden");
    root.piUi?.refreshIcons?.(banner);
  }
  async function showLogDialog(){
    const logs = await refresh();
    const dlg = document.createElement("dialog");
    dlg.style.cssText = "max-width:720px;width:90vw";
    dlg.innerHTML = `<div class="modal-body"><div class="modal-title-row"><span class="modal-icon"><i data-lucide="scroll-text"></i></span><div class="grow"><h2>Log Pi</h2><p class="muted small">Ultimi eventi del runtime</p></div><button class="icon-btn borderless" data-close><i data-lucide="x"></i></button></div><pre style="max-height:400px;overflow:auto;background:var(--surface-2);padding:10px;border-radius:8px;font:11px var(--mono);white-space:pre-wrap"></pre><div class="row end" style="margin-top:10px"><button class="btn ghost" data-close>Chiudi</button></div></div>`;
    dlg.querySelector("pre").textContent = logs.join("\n") || "(nessun log)";
    dlg.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", ()=> dlg.close()));
    dlg.addEventListener("close", ()=> dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
    root.piUi?.refreshIcons?.(dlg);
  }
  function init(){
    const e = el();
    e.healthLogBtn?.addEventListener("click", showLogDialog);
    // poll every 30s
    setInterval(refresh, 30000);
  }
  root.piHealth = { refresh, renderBanner, showLogDialog, init };
})(typeof window!=="undefined"?window:globalThis);
