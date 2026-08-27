"use strict";
(function exposeBudgets(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
  function fmtCost(c){ return root.piUtils?.fmtCost(c) ?? `$${Number(c).toFixed(2)}`; }
  function fmtTokens(n){ return root.piUtils?.fmtTokens(n) ?? `${n}`; }

  function render(){
    const e = el(); const s = state();
    if(!e.budgetsList) return;
    const budgets = s.settings?.budgets || {};
    const entries = Object.entries(budgets);
    if(!entries.length){
      e.budgetsList.innerHTML = `<div class="muted small">Nessun budget configurato. Aggiungi un limite per il progetto corrente e ricevi alert al 80%.</div>`;
      return;
    }
    e.budgetsList.innerHTML = "";
    for(const [cwd, b] of entries){
      const agg = root.piCosts?.getProjectCosts?.(cwd, s.sessions, null) || {count:0,cost:0,tokens:0};
      const costPct = b.maxCost ? Math.min(100, Math.round((agg.cost / b.maxCost)*100)) : null;
      const tokPct = b.maxTokens ? Math.min(100, Math.round((agg.tokens / b.maxTokens)*100)) : null;
      const pct = costPct!=null ? costPct : tokPct;
      const color = pct!=null ? (pct>=100?"var(--red)":pct>=80?"var(--amber)":"var(--green)") : "var(--hairline)";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--hairline);border-radius:8px;background:var(--surface)";
      const breakdown = breakdownByModel(cwd);
      row.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><span class="mono small" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(cwd)}">${esc(cwd)}</span><span class="small">${agg.count} chat · ${fmtTokens(agg.tokens)}${b.maxTokens?` / ${fmtTokens(b.maxTokens)}`:""} · ${fmtCost(agg.cost)}${b.maxCost?` / ${fmtCost(b.maxCost)}`:""}</span><button class="icon-btn tiny" data-del title="Rimuovi"><i data-lucide="trash-2"></i></button></div>
        ${(costPct!=null||tokPct!=null)?`<div style="height:6px;background:var(--surface-3);border-radius:999px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${color};transition:width .3s"></div></div><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)"><span>${costPct!=null?`Costo ${costPct}%`:""} ${costPct!=null&&tokPct!=null?"·":""} ${tokPct!=null?`Token ${tokPct}%`:""}</span><span style="color:${color};font-weight:600">${pct>=80?(pct>=100?"Limite superato":"Quasi al limite"):""}</span></div>`:""}
        ${breakdown?`<div class="muted" style="font-size:10px">${breakdown}</div>`:""}
        <div style="display:flex;gap:6px"><button class="btn ghost small" data-edit style="font-size:11px">Modifica</button><select data-reset style="font-size:11px;border-radius:6px;padding:2px 4px"><option value="" ${!b.reset||b.reset===""?"selected":""}>Mai</option><option value="monthly" ${b.reset==="monthly"?"selected":""}>Mensile</option><option value="session" ${b.reset==="session"?"selected":""}>Per sessione</option></select></div>`;
      row.querySelector("[data-del]")?.addEventListener("click", async ()=>{
        const next = {...budgets}; delete next[cwd];
        try{ s.settings = await api().setSettings({ budgets: next }); render(); toast("Budget rimosso"); }catch(err){ toast(err.message,"error"); }
      });
      row.querySelector("[data-edit]")?.addEventListener("click", async ()=>{
        const maxCostStr = prompt(`Budget costo massimo per ${cwd} (USD):`, String(b.maxCost ?? ""));
        if(maxCostStr===null) return;
        const maxTokensStr = prompt(`Budget token massimi:`, String(b.maxTokens ?? ""));
        if(maxTokensStr===null) return;
        const maxCost = maxCostStr.trim()===""? null : Number(maxCostStr);
        const maxTokens = maxTokensStr.trim()===""? null : Number(maxTokensStr);
        if(maxCost!==null && (!Number.isFinite(maxCost)||maxCost<0)) return toast("Costo non valido","error");
        if(maxTokens!==null && (!Number.isFinite(maxTokens)||maxTokens<0)) return toast("Token non validi","error");
        const next = {...budgets};
        next[cwd] = { ...(next[cwd]||{}), ...(maxCost!==null?{maxCost}:{}), ...(maxTokens!==null?{maxTokens}:{}) };
        if(maxCost===null) delete next[cwd].maxCost;
        if(maxTokens===null) delete next[cwd].maxTokens;
        try{ s.settings = await api().setSettings({ budgets: next }); render(); toast("Budget salvato"); checkAlerts(); }catch(err){ toast(err.message,"error"); }
      });
      row.querySelector("[data-reset]")?.addEventListener("change", async (ev)=>{
        const next = {...budgets}; next[cwd] = {...(next[cwd]||{}), reset: ev.target.value || undefined };
        if(!ev.target.value) delete next[cwd].reset;
        try{ s.settings = await api().setSettings({ budgets: next }); }catch{}
      });
      e.budgetsList.appendChild(row);
      if(pct!=null && pct>=80){
        row.style.borderColor = color;
        row.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${color} 15%, transparent)`;
      }
    }
    root.piUi?.refreshIcons?.(e.budgetsList);
  }
  function breakdownByModel(cwd){
    const s = state();
    // group by provider/model from session preference or active tab
    const map = new Map();
    for(const sess of (s.sessions||[]).filter(x=>x.cwd===cwd)){
      const pref = sess.preference || {};
      const key = pref.provider ? `${pref.provider}/${pref.modelId||""}` : "unknown";
      const cur = map.get(key)||{count:0,cost:0};
      cur.count++;
      if(typeof sess.cost==="number") cur.cost+=sess.cost;
      map.set(key, cur);
    }
    if(!map.size) return "";
    return [...map.entries()].slice(0,3).map(([k,v])=> `${esc(k)}: ${v.count} · ${fmtCost(v.cost)}`).join(" · ");
  }
  function checkAlerts(){
    const s = state();
    const budgets = s.settings?.budgets || {};
    for(const [cwd,b] of Object.entries(budgets)){
      const agg = root.piCosts?.getProjectCosts?.(cwd, s.sessions, null) || {cost:0,tokens:0};
      const costPct = b.maxCost ? (agg.cost / b.maxCost)*100 : 0;
      const tokPct = b.maxTokens ? (agg.tokens / b.maxTokens)*100 : 0;
      const pct = Math.max(costPct, tokPct);
      if(pct>=80 && pct<100){
        toast(`Budget ${cwd.split("/").pop()}: ${Math.round(pct)}% raggiunto`, "warn", 6000);
      } else if(pct>=100){
        toast(`Budget superato per ${cwd.split("/").pop()}!`, "error", 8000);
      }
    }
  }
  function init(){
    const e = el();
    e.budgetsAddBtn?.addEventListener("click", async ()=>{
      const s = state();
      const cwd = s.settings?.cwd || "";
      if(!cwd) return;
      const maxCostStr = prompt(`Budget costo massimo per ${cwd} (USD, vuoto = nessun limite):`, String(s.settings.budgets?.[cwd]?.maxCost ?? ""));
      if(maxCostStr===null) return;
      const maxTokensStr = prompt(`Budget token massimi per ${cwd} (vuoto = nessun limite):`, String(s.settings.budgets?.[cwd]?.maxTokens ?? ""));
      if(maxTokensStr===null) return;
      const maxCost = maxCostStr.trim()===""? null : Number(maxCostStr);
      const maxTokens = maxTokensStr.trim()===""? null : Number(maxTokensStr);
      if(maxCost!==null && (!Number.isFinite(maxCost)||maxCost<0)) return toast("Costo non valido","error");
      if(maxTokens!==null && (!Number.isFinite(maxTokens)||maxTokens<0)) return toast("Token non validi","error");
      const next = {...(s.settings.budgets||{})};
      if(maxCost===null && maxTokens===null) delete next[cwd];
      else next[cwd] = { ...(next[cwd]||{}), ...(maxCost!==null?{maxCost}:{}), ...(maxTokens!==null?{maxTokens}:{}) };
      if(next[cwd] && maxCost===null) delete next[cwd].maxCost;
      if(next[cwd] && maxTokens===null) delete next[cwd].maxTokens;
      try{ s.settings = await api().setSettings({ budgets: next }); render(); toast("Budget salvato"); checkAlerts(); }catch(err){ toast(err.message,"error"); }
    });
    // periodic check
    setInterval(checkAlerts, 30000);
  }
  root.piBudgets = { render, init, checkAlerts };
})(typeof window!=="undefined"?window:globalThis);
