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

  // L'explorer naviga esclusivamente nelle cartelle del progetto: il main lo
  // impone già (realpath + whitelist), qui lo rispettiamo come difesa e per UX.
  function isInsideProject(p){
    const rootPath=String(state().settings?.cwd||"").replace(/[\\/]+$/,"");
    const value=String(p||"");
    return !!rootPath && (value===rootPath || value.startsWith(rootPath+"/") || value.startsWith(rootPath+"\\"));
  }

  // Icona e colore per tipo di file: colori dai colori ufficiali dei linguaggi
  // (GitHub Linguist), schiariti dove troppo scuri per il tema dark.
  const FILE_TYPES = {
    js:{i:"file-code",c:"#f1e051"}, mjs:{i:"file-code",c:"#f1e051"}, cjs:{i:"file-code",c:"#f1e051"}, jsx:{i:"file-code",c:"#61dafb"},
    ts:{i:"file-code",c:"#4f9ad6"}, tsx:{i:"file-code",c:"#4f9ad6"}, mts:{i:"file-code",c:"#4f9ad6"}, cts:{i:"file-code",c:"#4f9ad6"},
    py:{i:"file-code",c:"#5aa0d8"}, ipynb:{i:"file-code",c:"#e0742a"},
    rb:{i:"file-code",c:"#cc3e44"}, go:{i:"file-code",c:"#00add8"}, rs:{i:"file-code",c:"#dea584"}, java:{i:"file-code",c:"#c98a3d"},
    kt:{i:"file-code",c:"#a97bff"}, kts:{i:"file-code",c:"#a97bff"}, swift:{i:"file-code",c:"#f05138"},
    c:{i:"file-code",c:"#a8b9cc"}, h:{i:"file-code",c:"#a8b9cc"}, cpp:{i:"file-code",c:"#f34b7d"}, cc:{i:"file-code",c:"#f34b7d"}, hpp:{i:"file-code",c:"#f34b7d"},
    cs:{i:"file-code",c:"#4db56a"}, php:{i:"file-code",c:"#8d97cf"}, lua:{i:"file-code",c:"#5f7fbe"}, dart:{i:"file-code",c:"#35b5e5"},
    vue:{i:"file-code",c:"#41b883"}, svelte:{i:"file-code",c:"#ff3e00"}, astro:{i:"file-code",c:"#ff5d01"},
    sh:{i:"square-terminal",c:"#89e051"}, bash:{i:"square-terminal",c:"#89e051"}, zsh:{i:"square-terminal",c:"#89e051"}, fish:{i:"square-terminal",c:"#89e051"},
    html:{i:"code",c:"#e34c26"}, htm:{i:"code",c:"#e34c26"}, xml:{i:"code",c:"#6aa5e8"},
    css:{i:"palette",c:"#6c8fd8"}, scss:{i:"palette",c:"#d2709c"}, sass:{i:"palette",c:"#d2709c"}, less:{i:"palette",c:"#6a8fc0"},
    json:{i:"file-json",c:"#cbcb41"}, jsonc:{i:"file-json",c:"#cbcb41"}, json5:{i:"file-json",c:"#cbcb41"},
    yml:{i:"file-cog",c:"#a074c4"}, yaml:{i:"file-cog",c:"#a074c4"}, toml:{i:"file-cog",c:"#b8a68a"}, ini:{i:"file-cog",c:"#b8a68a"}, conf:{i:"file-cog",c:"#b8a68a"}, cfg:{i:"file-cog",c:"#b8a68a"},
    env:{i:"variable",c:"#ecd53f"},
    md:{i:"file-text",c:"#519aba"}, mdx:{i:"file-text",c:"#519aba"}, rst:{i:"file-text",c:"#519aba"}, txt:{i:"file-text",c:"var(--muted)"}, log:{i:"scroll-text",c:"var(--muted)"},
    pdf:{i:"file-text",c:"#e05252"}, doc:{i:"file-text",c:"#6d9fdc"}, docx:{i:"file-text",c:"#6d9fdc"}, odt:{i:"file-text",c:"#6d9fdc"}, rtf:{i:"file-text",c:"#6d9fdc"},
    xls:{i:"file-spreadsheet",c:"#4caf6e"}, xlsx:{i:"file-spreadsheet",c:"#4caf6e"}, ods:{i:"file-spreadsheet",c:"#4caf6e"},
    csv:{i:"table",c:"#4caf6e"}, tsv:{i:"table",c:"#4caf6e"},
    ppt:{i:"presentation",c:"#e0704a"}, pptx:{i:"presentation",c:"#e0704a"}, odp:{i:"presentation",c:"#e0704a"}, key:{i:"presentation",c:"#e0704a"},
    png:{i:"image",c:"#b07ee0"}, jpg:{i:"image",c:"#b07ee0"}, jpeg:{i:"image",c:"#b07ee0"}, gif:{i:"image",c:"#b07ee0"}, webp:{i:"image",c:"#b07ee0"},
    bmp:{i:"image",c:"#b07ee0"}, ico:{i:"image",c:"#b07ee0"}, tiff:{i:"image",c:"#b07ee0"}, avif:{i:"image",c:"#b07ee0"}, heic:{i:"image",c:"#b07ee0"},
    svg:{i:"pen-tool",c:"#ffb13b"},
    mp4:{i:"film",c:"#d48ab0"}, mov:{i:"film",c:"#d48ab0"}, avi:{i:"film",c:"#d48ab0"}, mkv:{i:"film",c:"#d48ab0"}, webm:{i:"film",c:"#d48ab0"},
    mp3:{i:"music",c:"#5cb3d6"}, wav:{i:"music",c:"#5cb3d6"}, ogg:{i:"music",c:"#5cb3d6"}, flac:{i:"music",c:"#5cb3d6"}, aac:{i:"music",c:"#5cb3d6"}, m4a:{i:"music",c:"#5cb3d6"}, mid:{i:"music",c:"#5cb3d6"},
    zip:{i:"file-archive",c:"#d9a441"}, tar:{i:"file-archive",c:"#d9a441"}, gz:{i:"file-archive",c:"#d9a441"}, bz2:{i:"file-archive",c:"#d9a441"}, xz:{i:"file-archive",c:"#d9a441"}, "7z":{i:"file-archive",c:"#d9a441"}, rar:{i:"file-archive",c:"#d9a441"}, zst:{i:"file-archive",c:"#d9a441"},
    ttf:{i:"type",c:"#c99bd6"}, otf:{i:"type",c:"#c99bd6"}, woff:{i:"type",c:"#c99bd6"}, woff2:{i:"type",c:"#c99bd6"}, eot:{i:"type",c:"#c99bd6"},
    sql:{i:"database",c:"#e0a55c"}, db:{i:"database",c:"#e0a55c"}, sqlite:{i:"database",c:"#e0a55c"}, sqlite3:{i:"database",c:"#e0a55c"},
    lock:{i:"lock",c:"var(--muted)"},
    exe:{i:"binary",c:"var(--muted)"}, dll:{i:"binary",c:"var(--muted)"}, bin:{i:"binary",c:"var(--muted)"}, so:{i:"binary",c:"var(--muted)"}, dylib:{i:"binary",c:"var(--muted)"}, deb:{i:"binary",c:"var(--muted)"}, rpm:{i:"binary",c:"var(--muted)"}, appimage:{i:"binary",c:"var(--muted)"},
    prisma:{i:"database",c:"#7a9ec2"}, gql:{i:"database",c:"#e5a3b8"}, graphql:{i:"database",c:"#e5a3b8"},
  };
  // Nomi speciali che valgono più dell'estensione.
  const FILE_NAMES = {
    "package.json":{i:"package",c:"#8bc34a"}, "package-lock.json":{i:"lock",c:"var(--muted)"},
    "yarn.lock":{i:"lock",c:"var(--muted)"}, "pnpm-lock.yaml":{i:"lock",c:"var(--muted)"}, "bun.lockb":{i:"lock",c:"var(--muted)"},
    "makefile":{i:"wrench",c:"#9aa0a6"}, "dockerfile":{i:"container",c:"#2496ed"},
    "readme.md":{i:"book-open",c:"#519aba"}, "license.md":{i:"scale",c:"#c9a227"},
  };
  function fileTypeFor(ent){
    if(ent.isDirectory) return { i:"folder", c:"var(--blue)" };
    const name=(ent.name||"").toLowerCase();
    if(FILE_NAMES[name]) return FILE_NAMES[name];
    if(name.startsWith(".env")) return FILE_TYPES.env;
    if(name.startsWith(".git")) return { i:"git-branch", c:"#f05033" };
    if(name.startsWith("docker")) return { i:"container", c:"#2496ed" };
    if(name.startsWith("license")||name.startsWith("licence")||name==="copying") return { i:"scale", c:"#c9a227" };
    const ext=name.includes(".")?name.split(".").pop():"";
    return FILE_TYPES[ext] || { i:"file", c:"var(--muted)" };
  }

  async function loadExplorer(depth=currentDepth){
    const e = el();
    if(!e.explorerList) return;
    const projectCwd = state().settings?.cwd || "";
    if(!isInsideProject(currentDirectory)) currentDirectory=projectCwd;
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
  let explorerShowLimit = 150;
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
    const dirtySet = new Set(gitInfo?.dirtyFiles||[]);
    const toRender = sorted.slice(0, explorerShowLimit);
    for(const ent of toRender){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer";
      row.title = ent.path;
      row.tabIndex=0; row.setAttribute("role","button");
      const dirtyFiles=new Set(gitInfo?.dirtyFiles||[]);
      const gitBadge = (!ent.isDirectory && dirtyFiles.has(projectRelative(ent.path))) ? `<span title="git dirty" style="width:6px;height:6px;border-radius:50%;background:var(--amber);flex:0 0 6px"></span>` : "";
      const ft = fileTypeFor(ent);
      const sizeLabel = ent.isDirectory ? `<span class="muted" style="font-size:10px">${(ent.rel.split("/").length>1?"↳":"")}</span>` : `<span class="muted" style="font-size:10px">${formatSize(ent.size)}</span>`;
      row.innerHTML = `<span class="fx-icon" style="color:${ft.c}">${icon(ft.i)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${esc(ent.rel || ent.name)}</span>${gitBadge}${sizeLabel}<span style="display:flex;gap:2px;opacity:0" class="row-actions"><button data-act="copy" class="icon-btn tiny" title="${esc(tr("explorer.copyPath","Copia percorso"))}" aria-label="${esc(tr("explorer.copyPath","Copia percorso"))}" style="width:20px;height:20px"><i data-lucide="copy" style="width:12px;height:12px"></i></button><button data-act="open" class="icon-btn tiny" title="${esc(tr("explorer.openExternal","Apri esterno"))}" aria-label="${esc(tr("explorer.openExternal","Apri esterno"))}" style="width:20px;height:20px"><i data-lucide="external-link" style="width:12px;height:12px"></i></button></span>`;
      row.addEventListener("mouseenter", ()=>{ row.style.background="var(--hover)"; const a=row.querySelector(".row-actions"); if(a) a.style.opacity="1"; });
      row.addEventListener("mouseleave", ()=>{ row.style.background="transparent"; const a=row.querySelector(".row-actions"); if(a) a.style.opacity="0"; });
      row.addEventListener("focus",()=>{ const a=row.querySelector(".row-actions"); if(a) a.style.opacity="1"; });
      row.addEventListener("blur",()=>{ const a=row.querySelector(".row-actions"); if(a) a.style.opacity="0"; });
      row.addEventListener("click", async (ev)=>{
        if(ev.target.closest("button")) return;
        if(ent.isDirectory){
          if(!isInsideProject(ent.path)){ toast(tr("explorer.outsideProject","Solo cartelle del progetto"), "error", 2200); return; }
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
    if(sorted.length > explorerShowLimit){
      const more=document.createElement("button");
      more.className="project-more"; more.style.cssText="margin:8px auto;display:block";
      more.textContent=`Mostra altri ${Math.min(50, sorted.length - explorerShowLimit)} di ${sorted.length}`;
      more.addEventListener("click", ()=>{ explorerShowLimit += 50; renderExplorer(entries); });
      e.explorerList.appendChild(more);
    }
    // ponytail: batch icon refresh once, not per-row
    try{ root.piUi?.refreshIcons?.(e.explorerList); }catch{}
    // reset limit when filter changes externally is handled by explorerFilter reset below
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
      const ft = fileTypeFor(ent);
      const preview = esc(data.content.slice(0, 4000));
      dlg.innerHTML = `<div class="modal-body"><div class="modal-title-row"><span class="modal-icon" style="color:${ft.c}"><i data-lucide="${ft.i}"></i></span><div class="grow"><h2 style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ent.rel)}</h2><p class="muted small">${formatSize(data.size)} · anteprima file</p></div><button data-close class="icon-btn borderless"><i data-lucide="x"></i></button></div><section class="settings-section" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto"><pre style="flex:1;overflow:auto;background:var(--surface);padding:10px;border-radius:8px;font:11px var(--mono);white-space:pre-wrap;word-break:break-word;margin:0;border:1px solid var(--hairline)">${preview}${data.content.length>4000?"\n… troncato":""}</pre></section><div class="row gap end settings-actions"><button data-at class="btn ghost small"><i data-lucide="at-sign"></i> Inserisci @</button><button data-copy class="btn ghost small"><i data-lucide="copy"></i> Copia</button><button data-close2 class="btn primary small">Chiudi</button></div></div>`;
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
  // Breadcrumb: mostra il percorso dalla radice del progetto alla cartella
  // corrente; ogni segmento è cliccabile. Mai sopra la radice del progetto.
  function renderBreadcrumbs(){
    const panel = el().explorerPanel;
    if(!panel) return;
    let crumb = panel.querySelector("#explorer-breadcrumbs");
    if(!crumb){
      crumb = document.createElement("div");
      crumb.id = "explorer-breadcrumbs";
      const tb = panel.querySelector("#explorer-toolbar");
      if(tb) panel.insertBefore(crumb, tb); else panel.appendChild(crumb);
    }
    crumb.replaceChildren();
    const project = String(state().settings?.cwd||"").replace(/[\\/]+$/,"");
    if(!project || !currentDirectory || !isInsideProject(currentDirectory)){ crumb.classList.add("hidden"); return; }
    crumb.classList.remove("hidden");
    const rel = projectRelative(currentDirectory);
    const parts = rel===currentDirectory ? [] : rel.split(/[\\/]+/).filter(Boolean);
    const sep = currentDirectory.charAt(project.length) || "/";
    const seg = (label, path, isLast)=>{
      const b=document.createElement("button");
      b.type="button";
      b.className="crumb"+(isLast?" current":"");
      b.textContent=label;
      b.title=path;
      if(isLast) b.setAttribute("aria-current","location");
      else b.addEventListener("click", ()=>{ currentDirectory=path; loadExplorer(currentDepth); });
      crumb.appendChild(b);
    };
    seg(project.split(/[\\/]/).pop()||project, project, parts.length===0);
    let acc=project;
    parts.forEach((p,idx)=>{
      const arrow=document.createElement("span");
      arrow.className="crumb-sep"; arrow.textContent="›"; arrow.setAttribute("aria-hidden","true");
      crumb.appendChild(arrow);
      acc+=sep+p;
      seg(p, acc, idx===parts.length-1);
    });
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
      backBtn.className="icon-btn tiny"; backBtn.dataset.nav="back"; backBtn.innerHTML=icon("arrow-up"); backBtn.title=tr("explorer.parent","Cartella superiore"); backBtn.setAttribute("aria-label",backBtn.title);
      backBtn.addEventListener("click",()=>{
        const project=String(state().settings?.cwd||"").replace(/[\\/]+$/,"");
        // risale un livello qualunque sia il separatore (/ o \), senza uscire dal progetto
        if(!currentDirectory || !isInsideProject(currentDirectory)){ currentDirectory=project; loadExplorer(currentDepth); return; }
        if(currentDirectory===project) return;
        const cut=Math.max(currentDirectory.lastIndexOf("/"), currentDirectory.lastIndexOf("\\"));
        const parent=cut>0?currentDirectory.slice(0,cut):project;
        currentDirectory=isInsideProject(parent)?parent:project;
        loadExplorer(currentDepth);
      });
      const search = document.createElement("input");
      search.type = "search"; search.placeholder = tr("explorer.filter","Filtra file…"); search.style.cssText="flex:1;min-width:120px;height:28px;padding:4px 8px;border:1px solid var(--hairline);border-radius:7px;font-size:12px";
      search.addEventListener("input", ()=>{ explorerFilter = search.value.trim(); explorerShowLimit = 150; renderExplorer(state().explorerEntries); });
      const depthSel = document.createElement("select");
      depthSel.style.cssText="height:28px;border-radius:7px;font-size:11px";
      [1,2,3,4].forEach(d=>{ const o=document.createElement("option"); o.value=d; o.textContent=`depth ${d}`; if(d===currentDepth) o.selected=true; depthSel.appendChild(o); });
      depthSel.addEventListener("change", ()=>{ currentDepth = Number(depthSel.value); loadExplorer(currentDepth); });
      const dotBtn = document.createElement("button");
      dotBtn.className="btn ghost small"; dotBtn.style.cssText="height:28px;padding:0 8px;font-size:11px";
      const syncDot = ()=> dotBtn.textContent = showDotfiles ? `• ${tr("explorer.dotfiles","dotfile")}` : tr("explorer.dotfiles","dotfile");
      syncDot();
      dotBtn.addEventListener("click", ()=>{ showDotfiles=!showDotfiles; syncDot(); explorerShowLimit = 150; loadExplorer(currentDepth); });
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
    // breadcrumb + stato del tasto "su" a ogni navigazione
    const back = tb.querySelector("[data-nav=back]");
    if(back) back.disabled = !currentDirectory || currentDirectory===String(state().settings?.cwd||"").replace(/[\\/]+$/,"");
    renderBreadcrumbs();
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
