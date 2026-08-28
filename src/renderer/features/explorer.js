"use strict";
(function exposeExplorer(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function tr(key,fallback){ const value=root.i18n?.t?.(key); return value && value!==key ? value : fallback; }
  function icon(n){ return root.piUi?.icon(n) || `<i data-lucide="${n}"></i>`; }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  let explorerFilter = "";
  let showDotfiles = false;
  let currentDepth = 2;
  let gitInfo = null;
  let currentDirectory = "";

  function projectRelative(absPath){
    const rootPath=String(state().settings?.cwd||"").replace(/[\\/]+$/,"");
    const value=String(absPath||"");
    return value.startsWith(rootPath+"/") || value.startsWith(rootPath+"\\") ? value.slice(rootPath.length+1).replace(/\\/g,"/") : value;
  }

  const extIconMap = {
    js:"file-code", ts:"file-code", tsx:"file-code", jsx:"file-code", py:"file-code", go:"file-code", rs:"file-code",
    json:"braces", md:"file-text", txt:"file-text", html:"code", css:"palette", sh:"terminal", yml:"settings", yaml:"settings",
    png:"image", jpg:"image", jpeg:"image", gif:"image", webp:"image", svg:"image"
  };
  function iconFor(ent){
    if(ent.isDirectory) return "folder";
    const ext = (ent.name||"").split(".").pop().toLowerCase();
    return extIconMap[ext] || "file-text";
  }

  async function loadExplorer(depth=currentDepth){
    const e = el();
    if(!e.explorerList) return;
    const projectCwd = state().settings?.cwd || "";
    if(!currentDirectory || !(currentDirectory===projectCwd || currentDirectory.startsWith(projectCwd+"/") || currentDirectory.startsWith(projectCwd+"\\"))) currentDirectory=projectCwd;
    e.explorerList.innerHTML = `<div class="menu-empty">${esc(tr("explorer.loading","Caricamento…"))}</div>`;
    try{
      const [entries, git] = await Promise.all([
        api().listExplorer(currentDirectory, depth, showDotfiles),
        api().getGitStatus ? api().getGitStatus(projectCwd).catch(()=>null) : Promise.resolve(null)
      ]);
      gitInfo = git;
      state().explorerEntries = entries;
      renderExplorer(entries);
      updateToolbar();
    }catch(err){
      e.explorerList.innerHTML = `<div class="menu-empty">Errore: ${esc(err.message)}</div>`;
    }
  }
  function filteredEntries(entries){
    let out = entries || [];
    if(!showDotfiles) out = out.filter(en=> !en.name.startsWith(".") && !en.rel.split("/").some(seg=>seg.startsWith(".")));
    if(explorerFilter){
      const q = explorerFilter.toLowerCase();
      out = out.filter(en=> en.rel.toLowerCase().includes(q) || en.name.toLowerCase().includes(q));
    }
    return out;
  }
  function renderExplorer(entries){
    const e = el();
    if(!e.explorerList) return;
    const filtered = filteredEntries(entries);
    if(!filtered || !filtered.length){
      e.explorerList.innerHTML = `<div class="menu-empty">${entries&&entries.length?`Nessun risultato per “${esc(explorerFilter)}”`:esc(tr("explorer.empty","Cartella vuota."))}</div>`;
      return;
    }
    e.explorerList.innerHTML = "";
    // group: dirs first
    const sorted = [...filtered].sort((a,b)=>{
      if(a.isDirectory!==b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.rel.localeCompare(b.rel);
    });
    for(const ent of sorted){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer";
      row.title = ent.path;
      row.tabIndex=0; row.setAttribute("role","button");
      const dirtyFiles=new Set(gitInfo?.dirtyFiles||[]);
      const gitBadge = (!ent.isDirectory && dirtyFiles.has(projectRelative(ent.path))) ? `<span title="git dirty" style="width:6px;height:6px;border-radius:50%;background:var(--amber);flex:0 0 6px"></span>` : "";
      const sizeLabel = ent.isDirectory ? `<span class="muted" style="font-size:10px">${(ent.rel.split("/").length>1?"↳":"")}</span>` : `<span class="muted" style="font-size:10px">${formatSize(ent.size)}</span>`;
      row.innerHTML = `${icon(iconFor(ent))}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${esc(ent.rel || ent.name)}</span>${gitBadge}${sizeLabel}<span style="display:flex;gap:2px;opacity:0" class="row-actions"><button data-act="copy" class="icon-btn tiny" title="${esc(tr("explorer.copyPath","Copia percorso"))}" aria-label="${esc(tr("explorer.copyPath","Copia percorso"))}" style="width:20px;height:20px"><i data-lucide="copy" style="width:12px;height:12px"></i></button><button data-act="open" class="icon-btn tiny" title="${esc(tr("explorer.openExternal","Apri esterno"))}" aria-label="${esc(tr("explorer.openExternal","Apri esterno"))}" style="width:20px;height:20px"><i data-lucide="external-link" style="width:12px;height:12px"></i></button></span>`;
      row.addEventListener("mouseenter", ()=>{ row.style.background="var(--hover)"; const a=row.querySelector(".row-actions"); if(a) a.style.opacity="1"; });
      row.addEventListener("mouseleave", ()=>{ row.style.background="transparent"; const a=row.querySelector(".row-actions"); if(a) a.style.opacity="0"; });
      row.addEventListener("focus",()=>{ const a=row.querySelector(".row-actions"); if(a) a.style.opacity="1"; });
      row.addEventListener("blur",()=>{ const a=row.querySelector(".row-actions"); if(a) a.style.opacity="0"; });
      row.addEventListener("click", async (ev)=>{
        if(ev.target.closest("button")) return;
        if(ent.isDirectory){
          currentDirectory=ent.path;
          await loadExplorer(currentDepth);
          return;
        }
        await previewFile(ent);
      });
      row.addEventListener("keydown",(ev)=>{ if((ev.key==="Enter"||ev.key===" ")&&!ev.target.closest("button")){ ev.preventDefault(); row.click(); } });
      row.querySelector('[data-act="copy"]')?.addEventListener("click", async (ev)=>{
        ev.stopPropagation();
        try{ await navigator.clipboard.writeText(ent.path); toast("Path copiato","info",1500);}catch{ toast(ent.path,"info");}
      });
      row.querySelector('[data-act="open"]')?.addEventListener("click", (ev)=>{
        ev.stopPropagation();
        try{ api().openExternal(`file://${ent.path}`); }catch{ api().openExternal(ent.path); }
      });
      e.explorerList.appendChild(row);
    }
    root.piUi?.refreshIcons?.(e.explorerList);
  }
  function formatSize(n){
    if(n==null) return "";
    if(n<1024) return n+" B";
    if(n<1024*1024) return (n/1024).toFixed(1)+" KB";
    return (n/1024/1024).toFixed(1)+" MB";
  }
  async function previewFile(ent){
    try{
      const data = await api().readTextFile(ent.path);
      const inp = el().input;
      // create preview dialog
      const dlg = document.createElement("dialog");
      dlg.style.cssText = "max-width:780px;width:92vw;max-height:80vh";
      const lang = (ent.name.split(".").pop()||"").toLowerCase();
      const preview = esc(data.content.slice(0, 4000));
      dlg.innerHTML = `<div class="modal-body"><div class="modal-title-row"><span class="modal-icon"><i data-lucide="file-text"></i></span><div class="grow"><h2 style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ent.rel)}</h2><p class="muted small">${formatSize(data.size)} · anteprima file</p></div><button data-close class="icon-btn borderless"><i data-lucide="x"></i></button></div><section class="settings-section" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto"><pre style="flex:1;overflow:auto;background:var(--surface);padding:10px;border-radius:8px;font:11px var(--mono);white-space:pre-wrap;word-break:break-word;margin:0;border:1px solid var(--hairline)">${preview}${data.content.length>4000?"\n… troncato":""}</pre></section><div class="row gap end settings-actions"><button data-at class="btn ghost small"><i data-lucide="at-sign"></i> Inserisci @</button><button data-copy class="btn ghost small"><i data-lucide="copy"></i> Copia</button><button data-close2 class="btn primary small">Chiudi</button></div></div>`;
      const close = ()=>{ dlg.close(); dlg.remove(); };
      dlg.querySelectorAll("[data-close],[data-close2]").forEach(b=> b.addEventListener("click", close));
      dlg.addEventListener("close", ()=> dlg.remove());
      dlg.querySelector("[data-at]")?.addEventListener("click", ()=>{
        if(inp){
          const at = `@${projectRelative(ent.path)} `;
          const pos = inp.selectionStart ?? inp.value.length;
          inp.setRangeText(at, pos, pos, "end");
          inp.focus(); root.piComposer?.autosize?.();
        }
        toast(`@${projectRelative(ent.path)} inserito`, "info", 1800);
        close();
      });
      dlg.querySelector("[data-copy]")?.addEventListener("click", async ()=>{
        try{ await navigator.clipboard.writeText(data.content); toast("Contenuto copiato","info"); }catch{ toast("Copia fallita","error");}
      });
      document.body.appendChild(dlg);
      dlg.showModal();
      root.piUi?.refreshIcons?.(dlg);
      // also auto-insert @ on preview? no, user chooses
    }catch(err){ toast(err.message, "error"); }
  }
  function updateToolbar(){
    const panel = el().explorerPanel;
    if(!panel) return;
    let tb = panel.querySelector("#explorer-toolbar");
    if(!tb){
      tb = document.createElement("div");
      tb.id = "explorer-toolbar";
      tb.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap";
      const backBtn=document.createElement("button");
      backBtn.className="icon-btn tiny"; backBtn.innerHTML=icon("arrow-up"); backBtn.title=tr("explorer.parent","Cartella superiore"); backBtn.setAttribute("aria-label",backBtn.title);
      backBtn.addEventListener("click",()=>{
        const project=String(state().settings?.cwd||"").replace(/[\\/]+$/,"");
        if(currentDirectory===project) return;
        const parts=currentDirectory.replace(/\\/g,"/").split("/"); parts.pop();
        currentDirectory=parts.join("/") || project;
        if(!currentDirectory.startsWith(project)) currentDirectory=project;
        loadExplorer(currentDepth);
      });
      const search = document.createElement("input");
      search.type = "search"; search.placeholder = tr("explorer.filter","Filtra file…"); search.style.cssText="flex:1;min-width:120px;height:28px;padding:4px 8px;border:1px solid var(--hairline);border-radius:7px;font-size:12px";
      search.addEventListener("input", ()=>{ explorerFilter = search.value.trim(); renderExplorer(state().explorerEntries); });
      const depthSel = document.createElement("select");
      depthSel.style.cssText="height:28px;border-radius:7px;font-size:11px";
      [1,2,3,4].forEach(d=>{ const o=document.createElement("option"); o.value=d; o.textContent=`depth ${d}`; if(d===currentDepth) o.selected=true; depthSel.appendChild(o); });
      depthSel.addEventListener("change", ()=>{ currentDepth = Number(depthSel.value); loadExplorer(currentDepth); });
      const dotBtn = document.createElement("button");
      dotBtn.className="btn ghost small"; dotBtn.style.cssText="height:28px;padding:0 8px;font-size:11px";
      const syncDot = ()=> dotBtn.textContent = showDotfiles ? `• ${tr("explorer.dotfiles","dotfile")}` : tr("explorer.dotfiles","dotfile");
      syncDot();
      dotBtn.addEventListener("click", ()=>{ showDotfiles=!showDotfiles; syncDot(); loadExplorer(currentDepth); });
      const refreshBtn = document.createElement("button");
      refreshBtn.className="icon-btn tiny"; refreshBtn.innerHTML=icon("refresh-cw"); refreshBtn.title=tr("explorer.refresh","Ricarica"); refreshBtn.setAttribute("aria-label",refreshBtn.title);
      refreshBtn.addEventListener("click", ()=> loadExplorer(currentDepth));
      tb.append(backBtn, search, depthSel, dotBtn, refreshBtn);
      // insert after header row
      const header = panel.querySelector("div");
      if(header && header.nextSibling) panel.insertBefore(tb, header.nextSibling.nextSibling || panel.firstChild.nextSibling);
      else panel.prepend(tb);
      root.piUi?.refreshIcons?.(tb);
    }
    // update git badge in header if present
    if(gitInfo){
      const hdr = panel.querySelector("strong");
      if(hdr) hdr.title = gitInfo.label || gitInfo.branch || "";
    }
  }
  function setVisible(v){
    if(root.piRightPanel){ root.piRightPanel.setVisible(!!v); if(v) root.piRightPanel.switchTab("explorer"); return; }
    const e = el(); const s = state();
    s.explorerVisible = !!v;
    if(e.explorerPanel) e.explorerPanel.classList.toggle("hidden", !v);
    if(v) loadExplorer();
  }
  function toggle(){ if(root.piRightPanel){ root.piRightPanel.toggle(); return; } setVisible(!state().explorerVisible); }
  function init(){
    if(root.piRightPanel) return;
    const e = el();
    e.explorerToggle?.addEventListener("click", toggle);
    e.explorerClose?.addEventListener("click", ()=> setVisible(false));
    document.addEventListener("keydown", (ev)=>{
      if((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==="e"){ ev.preventDefault(); toggle(); }
    });
  }
  root.piExplorer = { loadExplorer, renderExplorer, setVisible, toggle, init };
})(typeof window!=="undefined"?window:globalThis);
