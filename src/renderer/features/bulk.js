"use strict";
(function exposeBulk(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }

  function updateBar(){
    const e = el(); const s = state();
    const n = s.selectedSessions?.size || 0;
    if(e.bulkBar) e.bulkBar.classList.toggle("hidden", !s.bulkMode);
    if(e.bulkCount) e.bulkCount.textContent = `${n} selezionate`;
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
    toast(state().bulkMode ? "Modalità selezione attiva" : "Selezione annullata", "info");
  }
  function toggleSession(file){
    const s = state();
    if(!s.bulkMode) setBulkMode(true);
    if(s.selectedSessions.has(file)) s.selectedSessions.delete(file);
    else s.selectedSessions.add(file);
    updateBar();
    root.piSidebar?.renderProjects?.();
  }
  async function bulkDelete(){
    const s = state();
    const files = [...s.selectedSessions];
    if(!files.length) return;
    if(!confirm(`Eliminare definitivamente ${files.length} sessioni?`)) return;
    try{
      const res = await api().bulkDeleteSessions(files);
      toast(`Eliminate ${res.deleted} sessioni${res.errors?.length?` (${res.errors.length} errori)`:""}`, res.errors?.length?"warn":"info");
      setBulkMode(false);
      await root.piSidebar?.refreshSessions?.();
      // if active session deleted, new chat
      if(s.activeSessionFile && files.includes(s.activeSessionFile)){
        await root.piSession?.newChat?.(s.settings?.cwd);
      }
    }catch(err){ toast(err.message, "error"); }
  }
  async function bulkExport(){
    const s = state();
    const files = [...s.selectedSessions];
    if(!files.length) return;
    try{
      const res = await api().bulkExportSessions(files);
      // create downloadable JSON summary
      const blob = new Blob([JSON.stringify(res.items||[], null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `pi-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`Esportate ${res.items?.length||0} sessioni (JSON)`, "info");
    }catch(err){ toast(err.message, "error"); }
  }
  function init(){
    const e = el();
    e.bulkCancelBtn?.addEventListener("click", ()=> setBulkMode(false));
    e.bulkDeleteBtn?.addEventListener("click", bulkDelete);
    e.bulkExportBtn?.addEventListener("click", bulkExport);
    // long-press or right-click on sidebar will be wired in sidebar.js
  }
  root.piBulk = { setBulkMode, toggleBulkMode, toggleSession, bulkDelete, bulkExport, updateBar, init };
})(typeof window!=="undefined"?window:globalThis);
