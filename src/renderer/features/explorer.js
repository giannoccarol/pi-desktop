"use strict";
(function exposeExplorer(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function icon(n){ return root.piUi?.icon(n) || `<i data-lucide="${n}"></i>`; }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  async function loadExplorer(depth=2){
    const e = el();
    if(!e.explorerList) return;
    const cwd = state().settings?.cwd || "";
    e.explorerList.innerHTML = `<div class="menu-empty">Caricamento…</div>`;
    try{
      const entries = await api().listExplorer(cwd, depth);
      state().explorerEntries = entries;
      renderExplorer(entries);
    }catch(err){
      e.explorerList.innerHTML = `<div class="menu-empty">Errore: ${esc(err.message)}</div>`;
    }
  }
  function renderExplorer(entries){
    const e = el();
    if(!e.explorerList) return;
    if(!entries || !entries.length){
      e.explorerList.innerHTML = `<div class="menu-empty">Cartella vuota.</div>`;
      return;
    }
    e.explorerList.innerHTML = "";
    for(const ent of entries){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:6px;cursor:pointer";
      row.title = ent.path;
      row.innerHTML = `${icon(ent.isDirectory ? "folder" : "file-text")}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ent.rel || ent.name)}</span><span class="muted" style="font-size:10px">${ent.isDirectory ? "" : (ent.size||0)+" B"}</span>`;
      row.addEventListener("click", async ()=>{
        if(ent.isDirectory) return;
        try{
          const data = await api().readTextFile(ent.path);
          // insert @ mention style: copy path to clipboard + insert into composer
          const inp = el().input;
          if(inp){
            const at = `@${ent.rel} `;
            const pos = inp.selectionStart || inp.value.length;
            inp.setRangeText(at, pos, pos, "end");
            inp.focus();
            root.piComposer?.autosize?.();
          }
          toast(`${ent.rel} — ${data.size} B caricati nel composer (anteprima ${data.content.length} ch)`, "info", 3000);
        }catch(err){ toast(err.message, "error"); }
      });
      row.addEventListener("mouseenter", ()=> row.style.background="var(--hover)");
      row.addEventListener("mouseleave", ()=> row.style.background="transparent");
      e.explorerList.appendChild(row);
    }
    root.piUi?.refreshIcons?.(e.explorerList);
  }
  function setVisible(v){
    const e = el(); const s = state();
    s.explorerVisible = !!v;
    if(e.explorerPanel) e.explorerPanel.classList.toggle("hidden", !v);
    if(v) loadExplorer();
  }
  function toggle(){ setVisible(!state().explorerVisible); }
  function init(){
    const e = el();
    e.explorerToggle?.addEventListener("click", toggle);
    e.explorerClose?.addEventListener("click", ()=> setVisible(false));
  }
  root.piExplorer = { loadExplorer, renderExplorer, setVisible, toggle, init };
})(typeof window!=="undefined"?window:globalThis);
