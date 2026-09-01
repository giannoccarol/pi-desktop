"use strict";
(function exposeTerminal(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function tr(key,fallback){ const value=root.i18n?.t?.(key); return value && value!==key ? value : fallback; }

  let histIndex = -1;
  let draftInput = "";

  function appendOutput(text, isError, isCmd){
    const out = el().terminalOutput;
    if(!out) return;
    const line = document.createElement("div");
    line.style.cssText = isCmd ? "color:var(--blue);font-weight:600" : isError ? "color:var(--red)" : "color:#d4d4d4";
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    const s = state();
    s.terminalHistory = s.terminalHistory || [];
    // store only command lines for ↑/↓
    if(isCmd){
      s.terminalHistory.push(text.replace(/^\$\s*/,""));
      if(s.terminalHistory.length>100) s.terminalHistory.splice(0,50);
      try{ api().setSettings({ terminalHistory: s.terminalHistory.slice(-40) }); }catch{}
      histIndex = s.terminalHistory.length;
    }
  }
  const interactiveRe = /^(vim|vi|nano|emacs|htop|top|less|more|fzf|ssh|tmux|screen)\b/i;
  function commandExecutable(command){
    const parts=String(command||"").trim().split(/\s+/);
    while(parts[0] && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[0]) || ["sudo","env","command","nohup"].includes(parts[0].toLowerCase()))) parts.shift();
    return parts.join(" ");
  }
  async function runCommand(cmd, exclude){
    if(!cmd.trim()) return;
    if(interactiveRe.test(commandExecutable(cmd))){ toast(`Comando interattivo non supportato nel terminale embedded (serve PTY). Usa terminale esterno.` , "warn", 4000); return; }
    const s = state();
    s.terminalBusy = true;
    appendOutput(`$ ${cmd}`, false, true);
    try{
      const res = await api().bash(cmd, !!exclude);
      const out = res.output || "(nessun output)";
      // split large output into lines for better scroll
      out.split("\n").forEach(l=> appendOutput(l, !!res.exitCode, false));
      if(res.truncated) appendOutput(`… troncato: ${res.fullOutputPath}`, false, false);
      if(res.exitCode) toast(`Exit ${res.exitCode}`, "warn", 2500);
    }catch(err){
      appendOutput(`Errore: ${err.message}`, true, false);
      toast(err.message, "error");
    }finally{
      s.terminalBusy = false;
      el().terminalInput?.focus();
    }
  }
  function setVisible(v){
    const e = el(); const s = state();
    s.terminalVisible = !!v;
    const panel = e.terminalPanel;
    if(!panel) return;
    if(v){
      // interrompe un'eventuale chiusura animata in corso
      panel._animCancel?.();
      panel.classList.remove("panel-closing");
      panel.classList.remove("hidden");
      syncHeader();
      e.terminalInput?.focus();
    } else {
      // esce con l'animazione specchiata: scende verso il basso, poi .hidden
      root.piUtils?.animateOut?.(panel, "panel-closing", 220);
    }
  }
  function toggle(){ setVisible(!state().terminalVisible); }
  // Badge shell + nome del tab: la shell di login (da $SHELL via main) e il
  // nome del progetto corrente, come i tab di un terminale dockato.
  async function syncHeader(){
    const badge = document.getElementById("term-shell-badge");
    if(badge && !badge.dataset.loaded){
      try{
        const info = await api().getShellInfo?.();
        if(info?.shell){ badge.textContent = info.shell; badge.dataset.loaded = "1"; }
      }catch{}
    }
    const tabName = document.getElementById("term-tab-name");
    if(tabName){
      const cwd = String(state().settings?.cwd || "");
      tabName.textContent = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd || "—";
    }
  }
  function clearScreen(){ const out = el().terminalOutput; if(out) out.innerHTML=""; }
  function init(){
    const e = el();
    e.terminalToggle?.addEventListener("click", toggle);
    e.terminalClose?.addEventListener("click", ()=> setVisible(false));
    document.getElementById("btn-terminal-tab-close")?.addEventListener("click", ()=> setVisible(false));
    const inp = e.terminalInput;
    const chk = document.getElementById("terminal-exclude");
    const out = e.terminalOutput;
    const exec = ()=>{
      const cmd = inp ? inp.value.trim() : "";
      if(!cmd) return;
      if(inp) inp.value = "";
      draftInput = "";
      histIndex = (state().terminalHistory||[]).length;
      runCommand(cmd, chk?.checked);
    };
    inp?.addEventListener("keydown", (ev)=>{
      const hist = state().terminalHistory || [];
      if(ev.key==="Enter"){
        ev.preventDefault(); exec();
      } else if(ev.key==="ArrowUp"){
        ev.preventDefault();
        if(histIndex===hist.length) draftInput = inp.value;
        histIndex = Math.max(0, histIndex-1);
        if(hist[histIndex]!=null) inp.value = hist[histIndex];
      } else if(ev.key==="ArrowDown"){
        ev.preventDefault();
        histIndex = Math.min(hist.length, histIndex+1);
        if(histIndex===hist.length) inp.value = draftInput;
        else if(hist[histIndex]!=null) inp.value = hist[histIndex];
      } else if(ev.key==="Escape"){
        if(inp.value) inp.value="";
        else setVisible(false);
      } else if((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==="l"){
        ev.preventDefault(); clearScreen();
      }
    });
    // barra del terminale dockato: copia, interrompi, esterno, nuova sessione
    document.getElementById("btn-term-copy")?.addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText(out ? out.innerText : ""); toast(tr("terminal.copied","Output copiato"),"info",1500);}catch{}
    });
    document.getElementById("btn-term-abort")?.addEventListener("click", async ()=>{
      try{ await api().abortBash(); appendOutput(tr("terminal.stopped","Comando interrotto."),true,false); }catch(err){ toast(err.message,"error"); }
    });
    document.getElementById("btn-term-external")?.addEventListener("click", async ()=>{
      const cwd = state().settings?.cwd || "";
      try{ await api().openTerminal(cwd); }catch(err){ toast(err.message,"error"); }
    });
    document.getElementById("btn-term-new")?.addEventListener("click", ()=>{
      clearScreen();
      if(inp){ inp.value=""; inp.focus(); }
    });
    // Ctrl+` toggle
    document.addEventListener("keydown", (ev)=>{
      if((ev.ctrlKey||ev.metaKey) && ev.key==="`"){ ev.preventDefault(); toggle(); }
    });
    syncHeader();
  }
  root.piTerminal = { runCommand, setVisible, toggle, init, appendOutput };
})(typeof window!=="undefined"?window:globalThis);
