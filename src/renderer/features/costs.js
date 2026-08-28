"use strict";
// Costs aggregation + dashboard dettagliata (timeline, breakdown, CSV, deep-link)
(function exposeCosts(root){
  function aggregateCostsByProject(sessions, statsByProject) {
    const map = new Map();
    const sessionsByCwd = new Map();
    for (const s of (sessions || [])) {
      if (!s || !s.cwd) continue;
      const key = s.cwd;
      const cur = sessionsByCwd.get(key) || { count: 0, cost: 0, tokens: 0 };
      cur.count += 1;
      if (typeof s.cost === "number") cur.cost += s.cost;
      if (s.tokens && typeof s.tokens.total === "number") cur.tokens += s.tokens.total;
      else if (typeof s.tokens === "number") cur.tokens += s.tokens;
      sessionsByCwd.set(key, cur);
    }
    if (statsByProject && typeof statsByProject === "object") {
      for (const [cwd, st] of Object.entries(statsByProject)) {
        const cur = map.get(cwd) || sessionsByCwd.get(cwd) || { count: sessionsByCwd.get(cwd)?.count || 0, cost: 0, tokens: 0 };
        if (st && typeof st.cost === "number") cur.cost += st.cost;
        if (st && st.tokens && typeof st.tokens.total === "number") cur.tokens += st.tokens.total;
        map.set(cwd, cur);
      }
      for (const [cwd, v] of sessionsByCwd.entries()) if (!map.has(cwd)) map.set(cwd, v);
    } else {
      for (const [k,v] of sessionsByCwd.entries()) map.set(k,v);
    }
    return map;
  }
  function getProjectCosts(cwd, sessions, statsByProject) {
    const map = aggregateCostsByProject(sessions, statsByProject);
    return map.get(cwd) || { count: 0, cost: 0, tokens: 0 };
  }
  function formatProjectCost(entry, t) {
    const tr = t || ((k,v)=>k);
    const parts = [];
    if (entry.count) parts.push(entry.count === 1 ? "1 chat" : entry.count + " chat");
    if (entry.tokens) {
      const fmt = root.piUtils ? root.piUtils.fmtTokens(entry.tokens) : String(entry.tokens);
      parts.push(fmt + " tok");
    }
    if (entry.cost) {
      const fmt = root.piUtils ? root.piUtils.fmtCost(entry.cost) : "$" + entry.cost.toFixed(2);
      parts.push(fmt);
    }
    if (parts.length) return parts.join(" · ");
    try { const v = tr("costs.empty"); if (v && v !== "costs.empty") return v; } catch {}
    return "—";
  }
  function timelineByDay(sessions, cwd){
    const map = new Map();
    for(const s of (sessions||[]).filter(x=> !cwd || x.cwd===cwd)){
      const d = new Date(s.modified||Date.now()).toISOString().slice(0,10);
      const cur = map.get(d) || { date:d, count:0, cost:0, tokens:0 };
      cur.count++;
      if(typeof s.cost==="number") cur.cost+=s.cost;
      if(typeof s.tokens==="number") cur.tokens+=s.tokens;
      else if(s.tokens && typeof s.tokens.total==="number") cur.tokens+=s.tokens.total;
      map.set(d, cur);
    }
    return [...map.values()].sort((a,b)=> a.date.localeCompare(b.date)).slice(-14);
  }
  function breakdownByProvider(sessions, cwd){
    const map = new Map();
    for(const s of (sessions||[]).filter(x=> !cwd || x.cwd===cwd)){
      const pref = s.preference || {};
      const key = pref.provider ? `${pref.provider}/${pref.modelId||""}` : "unknown";
      const cur = map.get(key)||{key, count:0, cost:0, tokens:0};
      cur.count++;
      if(typeof s.cost==="number") cur.cost+=s.cost;
      if(typeof s.tokens==="number") cur.tokens+=s.tokens;
      else if(s.tokens && typeof s.tokens.total==="number") cur.tokens+=s.tokens.total;
      map.set(key, cur);
    }
    return [...map.values()].sort((a,b)=> b.cost - a.cost).slice(0,6);
  }
  function renderProjectCosts() {
    try {
      const el = root.piStore ? root.piStore.el : {};
      const state = root.piStore ? root.piStore.state : {};
      if (!el.statusTokens) return;
      const cwd = state.settings ? state.settings.cwd : null;
      const activeCwd = state.tabs && state.activeTabId ? (state.tabs.find(x=>x.id===state.activeTabId)?.cwd || cwd) : cwd;
      if (!activeCwd) return;
      const entry = getProjectCosts(activeCwd, state.sessions, null);
      if (el.statusCwd) {
        el.statusCwd.title = formatProjectCost(entry, root.i18n ? root.i18n.t : null) + " — " + activeCwd;
      }
      // also update statusTokens with compact cost
      if(el.statusTokens){
        const costStr = entry.cost ? (root.piUtils?.fmtCost(entry.cost) ?? `$${entry.cost.toFixed(2)}`) : "";
        const tokStr = entry.tokens ? (root.piUtils?.fmtTokens(entry.tokens) ?? `${entry.tokens}`) : "";
        el.statusTokens.textContent = [tokStr && `${tokStr} tok`, costStr].filter(Boolean).join(" · ");
      }
    } catch {}
  }
  function openDashboard(){
    const state = root.piStore?.state || {};
    const cwd = state.settings?.cwd || "";
    const sessions = state.sessions || [];
    const agg = getProjectCosts(cwd, sessions, null);
    const tl = timelineByDay(sessions, cwd);
    const br = breakdownByProvider(sessions, cwd);
    const maxCost = Math.max(1, ...tl.map(d=>d.cost));
    const dlg = document.createElement("dialog");
    dlg.style.cssText="max-width:780px;width:94vw";
    const tlBars = tl.map(d=>{
      const h = Math.round((d.cost / maxCost)*60);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div title="${d.date}: ${d.cost.toFixed(3)} · ${d.count} chat" style="width:100%;height:60px;display:flex;align-items:flex-end"><div style="width:100%;height:${h}px;background:var(--blue);border-radius:4px 4px 0 0"></div></div><span style="font-size:9px;color:var(--muted)">${d.date.slice(5)}</span></div>`;
    }).join("");
    const brRows = br.map(b=> `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--hairline);font-size:12px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.key}</span><span class="muted">${b.count} chat</span><span>${root.piUtils?.fmtCost(b.cost) ?? "$"+b.cost.toFixed(2)}</span><span class="muted">${b.tokens?root.piUtils?.fmtTokens(b.tokens):""}</span></div>`).join("") || `<div class="muted small">Nessun breakdown</div>`;
    dlg.innerHTML = `<div class="modal-body"><div class="modal-title-row"><span class="modal-icon"><i data-lucide="bar-chart-3"></i></span><div class="grow"><h2>Costi — ${cwd.split("/").pop()||"progetto"}</h2><p class="muted small">${formatProjectCost(agg)} · ${sessions.filter(s=>s.cwd===cwd).length} sessioni</p></div><button class="icon-btn borderless" data-close><i data-lucide="x"></i></button></div>
      <section class="settings-section"><div class="settings-section-heading"><span class="settings-section-icon"><i data-lucide="calendar"></i></span><span><strong>Ultimi 14 giorni (costo)</strong><small>Andamento giornaliero</small></span></div><div style="display:flex;gap:4px;align-items:flex-end">${tlBars||"<span class='muted small'>Nessun dato</span>"}</div></section>
      <section class="settings-section"><div class="settings-section-heading"><span class="settings-section-icon"><i data-lucide="layers"></i></span><span><strong>Breakdown provider/modello</strong><small>Top per costo</small></span></div><div style="margin-top:2px">${brRows}</div></section>
      <div class="row gap end settings-actions"><button id="costs-csv" class="btn ghost small">Esporta CSV</button><button id="costs-deep" class="btn ghost small">Sessione più costosa →</button><button class="btn primary small" data-close>Chiudi</button></div></div>`;
    dlg.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", ()=> dlg.close()));
    dlg.addEventListener("close", ()=> dlg.remove());
    dlg.querySelector("#costs-csv")?.addEventListener("click", ()=>{
      const rows = [["date","count","cost","tokens"], ...tl.map(d=>[d.date,d.count,d.cost,d.tokens])];
      const csv = rows.map(r=>r.join(",")).join("\n");
      const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`pi-costs-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    });
    dlg.querySelector("#costs-deep")?.addEventListener("click", ()=>{
      const top = [...sessions.filter(s=>s.cwd===cwd)].sort((a,b)=> (b.cost||0)-(a.cost||0))[0];
      if(top){ dlg.close(); root.piSessionView?.openHistorySession?.(top); } else root.piUi?.toast?.("Nessuna sessione","warn");
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    root.piUi?.refreshIcons?.(dlg);
  }

  const api = { aggregateCostsByProject, getProjectCosts, formatProjectCost, renderProjectCosts, openDashboard, timelineByDay, breakdownByProvider };
  root.piCosts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
