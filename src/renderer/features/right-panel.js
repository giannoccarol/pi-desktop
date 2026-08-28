"use strict";
(function exposeRightPanel(root){
  const el = () => root.piStore?.el || {};
  const esc = (s) => root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
  function isVisible(){ const p=el().rightPanel; return p && !p.classList.contains("hidden"); }
  function setVisible(v){
    const p=el().rightPanel; if(!p) return;
    p.classList.toggle("hidden", !v);
    if(v) refresh();
    try{ root.piUi?.refreshIcons?.(p); }catch{}
  }
  let activeTab="explorer";
  function switchTab(tab){
    activeTab = tab==="changes" ? "changes" : "explorer";
    const a=el().rightExplorerPane, b=el().rightChangesPane;
    if(a) a.classList.toggle("hidden", activeTab!=="explorer");
    if(b) b.classList.toggle("hidden", activeTab!=="changes");
    const tabs = el().rightPanel ? el().rightPanel.querySelectorAll("[data-right-tab]") : [];
    tabs.forEach(t=> t.classList.toggle("active", t.dataset.rightTab===activeTab));
    if(activeTab==="explorer") root.piExplorer?.loadExplorer?.();
    else refreshChanges();
  }
  function toggle(tab){
    if(!tab){ if(isVisible()) setVisible(false); else setVisible(true);
      return; }
    const desired = tab;
    if(isVisible() && activeTab===desired) setVisible(false);
    else { setVisible(true); switchTab(desired); }
  }
  function refresh(){ if(activeTab==="explorer") root.piExplorer?.loadExplorer?.(); else refreshChanges(); }
  function updateBadge(n){
    const b=el().changesBadge, bi=el().changesBadgeInner;
    [b,bi].forEach(x=>{
      if(!x) return;
      x.textContent=String(n);
      x.classList.toggle("hidden", n===0);
    });
    if(b) b.style.display = n===0 ? "none" : "inline-flex";
  }
  function collectSeen(){
    const seen=new Map();
    document.querySelectorAll(".diff-view").forEach(v=>{
      const p=v.querySelector(".diff-path")?.textContent?.trim() || v.dataset.path || "";
      const key=p || ("diff-"+seen.size);
      if(!seen.has(key)) seen.set(key,v);
    });
    return seen;
  }
  function refreshChanges(){
    const list=el().changesList, detail=el().changesDetail;
    if(!list) return;
    const seen=collectSeen();
    // also count git dirty not yet shown as diff (optional badge)
    if(!seen.size){
      list.innerHTML='<div class="menu-empty">Nessuna modifica rilevata.<br><span class="muted small">I diff con <span style="color:var(--green)">verde</span>/<span style="color:var(--red)">rosso</span> appaiono qui e in chat.</span></div>';
      if(detail){ detail.classList.add("hidden"); detail.innerHTML=""; }
      updateBadge(0);
      return;
    }
    updateBadge(seen.size);
    list.innerHTML="";
    for(const [path, view] of seen){
      const added=view.querySelectorAll(".diff-line.added").length;
      const removed=view.querySelectorAll(".diff-line.removed").length;
      const row=document.createElement("div");
      row.className="changes-row";
      row.tabIndex=0; row.setAttribute("role","button");
      row.innerHTML=`<span class="changes-path" title="${esc(path)}">${esc(path)}</span><span class="changes-stats"><span style="color:var(--green)">+${added}</span> <span style="color:var(--red)">−${removed}</span></span><i data-lucide="chevron-right" style="width:12px;height:12px;color:var(--subtle)"></i>`;
      const open=()=>{
        if(!detail) { view.scrollIntoView({behavior:"smooth",block:"center"}); return; }
        detail.classList.remove("hidden");
        // clone diff-view but keep rosso/verde styles
        const clone=view.cloneNode(true);
        // ensure copy/open buttons still work via piDiffView delegation on detail
        detail.innerHTML=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><strong style="font:11px var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(path)}</strong><button class="icon-btn tiny" data-close-detail title="Chiudi dettaglio"><i data-lucide="x" style="width:12px;height:12px"></i></button></div>`;
        detail.appendChild(clone);
        detail.querySelector("[data-close-detail]")?.addEventListener("click", ()=> detail.classList.add("hidden"));
        root.piUi?.refreshIcons?.(detail);
        try{ root.piDiffView?.attachDiffActions?.(detail); }catch{}
        detail.scrollIntoView({behavior:"smooth",block:"nearest"});
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); }});
      list.appendChild(row);
    }
    root.piUi?.refreshIcons?.(list);
    try{ root.piDiffView?.attachDiffActions?.(list); }catch{}
  }
  function init(){
    const p=el().rightPanel;
    if(!p) return;
    // tabs
    p.querySelectorAll("[data-right-tab]").forEach(b=> b.addEventListener("click", ()=> switchTab(b.dataset.rightTab)));
    el().rightClose?.addEventListener("click", ()=> setVisible(false));
    // topbar: singola icona opposta a panel-left (Lorenzo: una sola icona a destra)
    el().explorerToggle?.addEventListener("click", ()=> toggle());
    // resizer
    const resizer=el().rightResizer;
    if(resizer){
      let startX, startW;
      const onMove=(e)=>{ const dx=startX - e.clientX; const w=Math.min(560, Math.max(260, startW+dx)); p.style.width=w+"px"; try{ localStorage.setItem("pi-right-w", String(w)); }catch{} };
      const onUp=()=>{ document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.classList.remove("is-resizing"); };
      resizer.addEventListener("mousedown",(e)=>{ startX=e.clientX; startW=p.getBoundingClientRect().width; document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); document.body.classList.add("is-resizing"); e.preventDefault(); });
      try{ const w=Number(localStorage.getItem("pi-right-w")); if(w>=260 && w<=560) p.style.width=w+"px"; }catch{}
    }
    // observe chat for new diffs to update badge even when hidden
    const target=document.getElementById("messages");
    const obs=new MutationObserver(()=>{
      const n=new Set([...document.querySelectorAll(".diff-view .diff-path")].map(e=>e.textContent.trim())).size;
      // if panel hidden, only badge; if open on changes, full refresh
      if(isVisible() && activeTab==="changes") refreshChanges();
      else updateBadge(n || document.querySelectorAll(".diff-view").length);
    });
    if(target) obs.observe(target,{childList:true,subtree:true});
    // keyboard: Ctrl+Shift+E explorer, Ctrl+Shift+D changes (non sovrascrive Cmd+K/B)
    document.addEventListener("keydown",(e)=>{
      if((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==="e"){ e.preventDefault(); toggle("explorer"); }
      if((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==="d"){ e.preventDefault(); toggle("changes"); }
    });
    // initial badge
    updateBadge(0);
    // delegate diff actions inside detail pane (copy/apri)
    if(el().changesDetail) try{ root.piDiffView?.attachDiffActions?.(el().changesDetail); }catch{}
  }
  root.piRightPanel={init, toggle, setVisible, isVisible, switchTab, refresh, refreshChanges};
})(typeof window!=="undefined"?window:globalThis);
