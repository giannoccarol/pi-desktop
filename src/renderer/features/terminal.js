"use strict";
(function exposeTerminal(root){
  const api = () => root.piDesktop;
  const el = () => root.piStore?.el || {};
  const state = () => root.piStore?.state || {};
  function toast(m,k,ms){ return root.piUi?.toast(m,k,ms); }
  function esc(s){ return root.piUtils?.escapeHtml(s) ?? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  function appendOutput(text, isError){
    const out = el().terminalOutput;
    if(!out) return;
    const line = document.createElement("div");
    line.textContent = text;
    if(isError) line.style.color = "var(--red)";
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    // keep history bounded
    const s = state();
    s.terminalHistory = s.terminalHistory || [];
    s.terminalHistory.push(text.slice(0, 2000));
    if(s.terminalHistory.length>80) s.terminalHistory.splice(0, 40);
    // persist lightly via settings
    try{ api().setSettings({ terminalHistory: s.terminalHistory.slice(-40) }); }catch{}
  }
  async function runCommand(cmd, exclude){
    if(!cmd.trim()) return;
    const s = state();
    s.terminalBusy = true;
    appendOutput(`$ ${cmd}`, false);
    try{
      const res = await api().bash(cmd, !!exclude);
      appendOutput(res.output || "(nessun output)", !!res.exitCode);
      if(res.truncated) appendOutput(`… troncato: ${res.fullOutputPath}`, false);
    }catch(err){
      appendOutput(`Errore: ${err.message}`, true);
      toast(err.message, "error");
    }finally{
      s.terminalBusy = false;
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
    const exec = ()=>{
      const cmd = inp ? inp.value.trim() : "";
      if(!cmd) return;
      if(inp) inp.value = "";
      runCommand(cmd, chk?.checked);
    };
    btn?.addEventListener("click", exec);
    inp?.addEventListener("keydown", (ev)=>{
      if(ev.key==="Enter"){ ev.preventDefault(); exec(); }
      if(ev.key==="Escape") setVisible(false);
    });
  }
  root.piTerminal = { runCommand, setVisible, toggle, init, appendOutput };
})(typeof window!=="undefined"?window:globalThis);
