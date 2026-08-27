"use strict";
(function exposeBudgets(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  function render(){
    const e = el(); const s = state();
    if(!e.budgetsList) return;
    const budgets = s.settings?.budgets || {};
    const entries = Object.entries(budgets);
    if(!entries.length){
      e.budgetsList.innerHTML = `<div class="muted small">Nessun budget configurato.</div>`;
      return;
    }
    e.budgetsList.innerHTML = "";
    for(const [cwd, b] of entries){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--hairline);border-radius:8px;background:var(--surface)";
      row.innerHTML = `<span class="mono small" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(cwd)}">${esc(cwd)}</span><span class="small">${b.maxCost!=null?`$${b.maxCost}`:""} ${b.maxTokens!=null?`${b.maxTokens} tok`:""}</span><button class="icon-btn tiny" data-del title="Rimuovi"><i data-lucide="trash-2"></i></button>`;
      row.querySelector("[data-del]")?.addEventListener("click", async ()=>{
        const next = {...budgets}; delete next[cwd];
        try{ s.settings = await api().setSettings({ budgets: next }); render(); toast("Budget rimosso"); }catch(err){ toast(err.message,"error"); }
      });
      e.budgetsList.appendChild(row);
    }
    root.piUi?.refreshIcons?.(e.budgetsList);
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
      // clean nulls
      if(next[cwd] && maxCost===null) delete next[cwd].maxCost;
      if(next[cwd] && maxTokens===null) delete next[cwd].maxTokens;
      try{ s.settings = await api().setSettings({ budgets: next }); render(); toast("Budget salvato"); }catch(err){ toast(err.message,"error"); }
    });
  }
  root.piBudgets = { render, init };
})(typeof window!=="undefined"?window:globalThis);
