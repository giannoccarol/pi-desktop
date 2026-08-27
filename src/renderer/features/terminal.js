"use strict";
(function exposeTerminal(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }

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
  const interactiveRe = /^(vim|vi|nano|emacs|htop|top|less|more|fzf|ssh|tmux|screen)\b/;
  async function runCommand(cmd, exclude){
    if(!cmd.trim()) return;
    if(interactiveRe.test(cmd.trim())){ toast(`Comando interattivo "${cmd.split(" ")[0]}" non supportato nel terminale embedded (serve PTY). Usa terminale esterno.` , "warn", 4000); return; }
    const s = state();
    s.terminalBusy = true;
    const btn = document.getElementById("btn-terminal-run");
    if(btn) btn.disabled = true;
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
      if(btn) btn.disabled = false;
      el().terminalInput?.focus();
    }
  }
  function setVisible(v){
    const e = el(); const s = state();
    s.terminalVisible = !!v;
    if(e.terminalPanel) e.terminalPanel.classList.toggle("hidden", !v);
    if(v) e.terminalInput?.focus();
  }
  function toggle(){ setVisible(!state().terminalVisible); }
  function init(){
    const e = el();
    e.terminalToggle?.addEventListener("click", toggle);
    e.terminalClose?.addEventListener("click", ()=> setVisible(false));
    const inp = e.terminalInput;
    const btn = document.getElementById("btn-terminal-run");
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
    btn?.addEventListener("click", exec);
    // toolbar: clear / copy
    const panel = e.terminalPanel;
    if(panel && !panel.querySelector("#term-toolbar")){
      const tb = document.createElement("div");
      tb.id="term-toolbar";
      tb.style.cssText="display:flex;gap:4px;justify-content:flex-end;margin-bottom:4px";
      const copyBtn = document.createElement("button");
      copyBtn.className="btn ghost small"; copyBtn.style.cssText="height:24px;font-size:11px;padding:0 6px";
      copyBtn.textContent="Copia";
      copyBtn.addEventListener("click", async ()=>{
        try{ await navigator.clipboard.writeText(out ? out.innerText : ""); toast("Output copiato","info",1500);}catch{}
      });
      const clearBtn = document.createElement("button");
      clearBtn.className="btn ghost small"; clearBtn.style.cssText="height:24px;font-size:11px;padding:0 6px";
      clearBtn.textContent="Pulisci";
      clearBtn.addEventListener("click", ()=>{ if(out) out.innerHTML=""; });
      const openBtn = document.createElement("button");
      openBtn.className="btn ghost small"; openBtn.style.cssText="height:24px;font-size:11px;padding:0 6px";
      openBtn.textContent="Apri terminale esterno";
      openBtn.addEventListener("click", ()=>{
        const cwd = state().settings?.cwd || "";
        // best effort: open cwd in external handler (file://)
        try{ api().openExternal(`file://${cwd}`); }catch{}
      });
      tb.append(copyBtn, clearBtn, openBtn);
      panel.insertBefore(tb, panel.querySelector("pre"));
    }
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
        ev.preventDefault(); if(out) out.innerHTML="";
      }
    });
    // Ctrl+` toggle
    document.addEventListener("keydown", (ev)=>{
      if((ev.ctrlKey||ev.metaKey) && ev.key==="`"){ ev.preventDefault(); toggle(); }
    });
  }
  root.piTerminal = { runCommand, setVisible, toggle, init, appendOutput };
})(typeof window!=="undefined"?window:globalThis);
