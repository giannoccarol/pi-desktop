"use strict";
(function exposeBulk(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function tr(key,vars,fallback){ const value=root.i18n?.t?.(key,vars); return value && value!==key ? value : fallback; }
  function fmtCost(c){ return root.piUtils?.fmtCost(c) ?? `$${Number(c).toFixed(2)}`; }
  function fmtTokens(n){ return root.piUtils?.fmtTokens(n) ?? `${n}`; }

  function updateBar(){
    const e = el(); const s = state();
    const n = s.selectedSessions?.size || 0;
    if(e.bulkBar){
      e.bulkBar.classList.toggle("hidden", !s.bulkMode);
      // inject extended controls once
      if(s.bulkMode && !e.bulkBar.querySelector("#bulk-select-all")){
        const selAll = document.createElement("button");
        selAll.id="bulk-select-all"; selAll.className="btn ghost small"; selAll.textContent=tr("bulk.selectAll",null,"Tutti");
        selAll.title=tr("bulk.selectVisible",null,"Seleziona tutte le visibili");
        selAll.addEventListener("click", selectAllVisible);
        const selPinned = document.createElement("button");
        selPinned.id="bulk-select-pinned"; selPinned.className="btn ghost small"; selPinned.textContent=tr("bulk.selectPinned",null,"Fissate");
        selPinned.addEventListener("click", ()=> selectByMeta("pinned"));
        const tagBtn = document.createElement("button");
        tagBtn.id="bulk-tag"; tagBtn.className="btn ghost small"; tagBtn.textContent=tr("bulk.tag",null,"Tag…");
        tagBtn.addEventListener("click", bulkTag);
        const archBtn = document.createElement("button");
        archBtn.id="bulk-archive"; archBtn.className="btn ghost small"; archBtn.textContent=tr("bulk.archive",null,"Archivia");
        archBtn.addEventListener("click", bulkArchive);
        const csvBtn = document.createElement("button");
        csvBtn.id="bulk-csv"; csvBtn.className="btn ghost small"; csvBtn.textContent="CSV";
        csvBtn.addEventListener("click", ()=> bulkExport("csv"));
        // insert before delete
        const del = e.bulkDeleteBtn;
        if(del && del.parentNode===e.bulkBar){
          e.bulkBar.insertBefore(selAll, del);
          e.bulkBar.insertBefore(selPinned, del);
          e.bulkBar.insertBefore(tagBtn, del);
          e.bulkBar.insertBefore(archBtn, del);
          e.bulkBar.insertBefore(csvBtn, del);
        } else {
          e.bulkBar.append(selAll, selPinned, tagBtn, archBtn, csvBtn);
        }
      }
    }
    if(e.bulkCount){
      const sel = [...(s.selectedSessions||[])];
      let cost=0, tokens=0;
      for(const f of sel){
        const sess = s.sessions.find(x=>x.file===f);
        if(sess){
          if(typeof sess.cost==="number") cost+=sess.cost;
          if(typeof sess.tokens==="number") tokens+=sess.tokens;
          else if(sess.tokens && typeof sess.tokens.total==="number") tokens+=sess.tokens.total;
        }
      }
      const extra = sel.length ? ` · ${fmtTokens(tokens)} · ${fmtCost(cost)}` : "";
      e.bulkCount.textContent = `${tr("bulk.selected",{count:n},`${n} selezionate`)}${extra}`;
    }
    if(e.bulkDeleteBtn) e.bulkDeleteBtn.disabled = n===0;
    if(e.bulkExportBtn) e.bulkExportBtn.disabled = n===0;
  }
  function setBulkMode(v){
    state().bulkMode = !!v;
    if(!v) state().selectedSessions.clear();
    updateBar();
    root.piSidebar?.renderProjects?.();
  }
  function toggleBulkMode(){
    setBulkMode(!state().bulkMode);
    toast(state().bulkMode ? tr("bulk.modeActive",null,"Modalità selezione attiva") : tr("bulk.modeCancelled",null,"Selezione annullata"), "info");
  }
  function toggleSession(file){
    const s = state();
    if(!s.bulkMode) setBulkMode(true);
    if(s.selectedSessions.has(file)) s.selectedSessions.delete(file);
    else s.selectedSessions.add(file);
    updateBar();
    root.piSidebar?.renderProjects?.();
  }
  function selectAllVisible(){
    const s = state();
    const visible = getVisibleSessions();
    for(const sess of visible) s.selectedSessions.add(sess.file);
    updateBar(); root.piSidebar?.renderProjects?.();
    toast(`${visible.length} selezionate`, "info", 1500);
  }
  function selectByMeta(key){
    const s = state();
    const meta = s.settings?.sessionMeta || {};
    const visible = getVisibleSessions();
    for(const sess of visible){
      if(meta[sess.file] && meta[sess.file][key]) s.selectedSessions.add(sess.file);
    }
    updateBar(); root.piSidebar?.renderProjects?.();
  }
  function getVisibleSessions(){
    const files = new Set([...document.querySelectorAll(".session-item[data-session-file]")].map((node)=>node.dataset.sessionFile).filter(Boolean));
    return (state().sessions || []).filter((session)=>files.has(session.file));
  }
  async function bulkTag(){
    const s = state(); const files=[...s.selectedSessions];
    if(!files.length) return;
    const tag = prompt("Tag da aggiungere (virgola per multipli, vuoto per rimuovere tutti):");
    if(tag===null) return;
    const tags = tag.trim()? tag.split(",").map(t=>t.trim().toLowerCase()).filter(Boolean).slice(0,8) : [];
    for(const f of files){
      const current = s.settings?.sessionMeta?.[f]?.tags || [];
      try{ await api().setSessionMeta(f, {tags:tags.length ? [...new Set([...current, ...tags])].slice(0,8) : []}); }catch{}
    }
    const metaMap = await api().getSessionMeta().catch(()=>null);
    if(metaMap) state().settings.sessionMeta = metaMap;
    toast(tags.length?`Tag aggiornati: ${tags.join(", ")}`:"Tag rimossi", "info");
    root.piSidebar?.renderProjects?.();
  }
  async function bulkArchive(){
    const s = state(); const files=[...s.selectedSessions];
    if(!files.length) return;
    const shouldArchive = !files.every((f)=>s.settings?.sessionMeta?.[f]?.archived);
    for(const f of files){
      try{ await api().setSessionMeta(f, {archived: shouldArchive}); }catch{}
    }
    const metaMap = await api().getSessionMeta().catch(()=>null);
    if(metaMap) state().settings.sessionMeta = metaMap;
    toast(shouldArchive ? "Sessioni archiviate" : "Sessioni ripristinate dall'archivio", "info");
    root.piSidebar?.renderProjects?.();
  }
  let lastTrashSnapshot = [];
  async function bulkDelete(){
    const s = state();
    const files = [...s.selectedSessions];
    if(!files.length) return;
    if(!confirm(`Spostare nel trash ${files.length} sessioni? (Ripristino 30gg)`)) return;
    try{
      const beforeTrash = await api().listTrash().catch(()=>[]);
      const res = await api().bulkDeleteSessions(files);
      const afterTrash = await api().listTrash().catch(()=>[]);
      const newTrash = afterTrash.filter(a=> !beforeTrash.some(b=>b.file===a.file));
      lastTrashSnapshot = newTrash.map(t=>t.file);
      toast(`Spostate nel trash ${res.deleted} sessioni${res.errors?.length?` (${res.errors.length} errori)`:`;`} — Annulla 10s`, res.errors?.length?"warn":"info", 10000);
      setTimeout(()=>{ lastTrashSnapshot=[]; }, 10000);
      setBulkMode(false);
      await root.piSidebar?.refreshSessions?.();
      if(s.activeSessionFile && files.includes(s.activeSessionFile)){
        await root.piSession?.newChat?.(s.settings?.cwd);
      }
      if(lastTrashSnapshot.length){
        document.querySelector(".bulk-undo-floating")?.remove();
        const host = document.createElement("div");
        host.className="bulk-undo-floating";
        host.setAttribute("role", "status");
        host.textContent=tr("bulk.inTrash",{count:lastTrashSnapshot.length},`${lastTrashSnapshot.length} sessioni nel trash`);
        const undo = document.createElement("button");
        undo.className="btn primary small"; undo.textContent=tr("bulk.undo",{count:lastTrashSnapshot.length},`Annulla (${lastTrashSnapshot.length})`);
        undo.addEventListener("click", async ()=>{
          let restored=0;
          for(const tf of [...lastTrashSnapshot]){ try{ await api().restoreTrash(tf); restored++; }catch{} }
          toast(`Ripristinate ${restored} sessioni`, restored?"info":"warn");
          lastTrashSnapshot=[];
          host.remove();
          await root.piSidebar?.refreshSessions?.();
        });
        host.appendChild(undo);
        document.body.appendChild(host);
        setTimeout(()=> host.remove(), 10000);
      }
    }catch(err){ toast(err.message, "error"); }
  }
  async function bulkExport(fmt="json"){
    const s = state();
    const files = [...s.selectedSessions];
    if(!files.length) return;
    try{
      const res = await api().bulkExportSessions(files);
      if(fmt==="csv"){
        const csvCell = (value)=>{
          let text=String(value ?? "");
          if(/^[=+\-@]/.test(text)) text=`'${text}`;
          return `"${text.replace(/"/g,'""')}"`;
        };
        const rows = [["file","name","preview","cost","tokens","modified"]];
        for(const it of (res.items||[])){
          const sess = it.session || s.sessions.find(x=>x.file===it.file) || {};
          rows.push([it.file, sess.name||"", sess.preview||"", sess.cost||"", sess.tokens?.total||sess.tokens||"", sess.modified||""]);
        }
        const csv = rows.map(r=>r.map(csvCell).join(",")).join("\n");
        const blob = new Blob([csv], {type:"text/csv"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url; a.download=`pi-export-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
        toast(`CSV esportato (${res.items?.length||0})`, "info");
      } else {
        const blob = new Blob([JSON.stringify(res.items||[], null, 2)], {type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `pi-export-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast(`Esportate ${res.items?.length||0} sessioni (JSON)`, "info");
      }
    }catch(err){ toast(err.message, "error"); }
  }
  function init(){
    const e = el();
    e.bulkCancelBtn?.addEventListener("click", ()=> setBulkMode(false));
    e.bulkDeleteBtn?.addEventListener("click", bulkDelete);
    e.bulkExportBtn?.addEventListener("click", ()=> bulkExport("json"));
  }
  root.piBulk = { setBulkMode, toggleBulkMode, toggleSession, bulkDelete, bulkExport, updateBar, init, selectAllVisible };
})(typeof window!=="undefined"?window:globalThis);
