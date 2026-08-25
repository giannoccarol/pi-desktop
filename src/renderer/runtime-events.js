"use strict";
(function (root) {
  function createRuntimeEvents({ state, el, api, t, icon, escapeHtml, textOfBlocks, compactToolArgs, fullToolArgs, toolIconName, makeToolCard, setToolCardResult, renderBlockMedia, beginStreamAssistant, streamApplyDelta, endStreamAssistant, setBusy, setUserMessageStatus, refreshStats, refreshSessionsSoon, refreshTabsSoon, refreshIcons, renderQueuePanel, renderTabs, renderProjects, handleUiRequest, scheduleScroll }) {
    function handleEvent(msg) {
      if (msg.tabId) {
        const tab = state.tabs.find((c) => c.id === msg.tabId);
        if (tab) {
          if (msg.type === "agent_start") tab.busy = true;
          if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "pi-started") tab.busy = false;
          if (msg.type === "tab_status") tab.busy = Boolean(msg.busy);
          renderTabs(); renderProjects();
        }
        if (state.activeTabId && msg.tabId !== state.activeTabId && msg.type !== "extension_ui_request") {
          if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "tab_status") { refreshSessionsSoon(); refreshTabsSoon(); }
          return;
        }
      }
      switch (msg.type) {
        case "agent_start": state.lastAssistantErrored=false; state.lastAssistantErrorWrap=null; state.retryAttempt=0; setBusy(true); setUserMessageStatus(state.activeUserMessage,"processing"); break;
        case "agent_settled": setUserMessageStatus(state.activeUserMessage, state.lastAssistantErrored?"failed":"done"); state.activeUserMessage=null; state.lastAssistantErrorWrap=null; state.retryAttempt=0; setBusy(false); refreshStats(); refreshSessionsSoon(); break;
        case "message_start":
          if (msg.message?.role==="assistant") { setUserMessageStatus(state.activeUserMessage,"processing"); beginStreamAssistant(); }
          else if (msg.message?.role==="user") { const txt=textOfBlocks(msg.message.content); const idx=state.queuedUserMessages.findIndex(e=>e.message===txt); if(idx>=0){ const [entry]=state.queuedUserMessages.splice(idx,1); state.activeUserMessage=entry.userMessage; setUserMessageStatus(entry.userMessage,"processing"); } }
          break;
        case "message_update": streamApplyDelta(msg); break;
        case "message_end": endStreamAssistant(msg.message); break;
        case "turn_end": refreshStats(); break;
        case "tool_execution_start": { const name=msg.toolName||"tool"; const card=state.tools.get(msg.toolCallId)||makeToolCard(name, compactToolArgs(name,msg.args)); card.dataset.tool=name.toLowerCase(); card.querySelector(".tool-name").innerHTML=`${icon(toolIconName(name))} ${escapeHtml(name)}`; const a=card.querySelector(".tool-args"); a.textContent=compactToolArgs(name,msg.args); a.title=fullToolArgs(msg.args); state.tools.set(msg.toolCallId,card); refreshIcons(); break; }
        case "tool_execution_update": { const card=state.tools.get(msg.toolCallId); if(card){ card.querySelector(".tool-body pre").textContent=textOfBlocks(msg.partialResult?.content); renderBlockMedia(card.querySelector(".tool-body"), msg.partialResult?.content, "Anteprima"); } break; }
        case "tool_execution_end": { const card=state.tools.get(msg.toolCallId); if(card){ setToolCardResult(card, textOfBlocks(msg.result?.content), Boolean(msg.isError), msg.result?.content); state.tools.delete(msg.toolCallId); } break; }
        case "bash_execution_update": { if(state.directBashCard){ state.directBashCard.querySelector(".tool-body pre").textContent+=(msg.delta||""); scheduleScroll(); } break; }
        case "queue_update": state.nativeQueue={steering:msg.steering||[], followUp:msg.followUp||[]}; renderQueuePanel(); break;
        case "compaction_start": el.statusActivity.textContent="compazione del contesto…"; break;
        case "compaction_end": el.statusActivity.textContent=""; root.piUi&&root.piUi.toast&&root.piUi.toast("Contesto compattato.","info"); break;
        case "auto_retry_start": state.lastAssistantErrorWrap?.remove(); state.lastAssistantErrorWrap=null; state.lastAssistantErrored=false; state.retryAttempt=msg.attempt||state.retryAttempt+1; el.statusActivity.textContent=`errore transitorio — retry ${msg.attempt}/${msg.maxAttempts}`; setUserMessageStatus(state.activeUserMessage,"retrying"); break;
        case "auto_retry_end": el.statusActivity.textContent=state.busy?"agente al lavoro…":""; if(msg.success){ state.lastAssistantErrored=false; setUserMessageStatus(state.activeUserMessage,"processing"); } else { state.lastAssistantErrored=true; setUserMessageStatus(state.activeUserMessage,"failed"); root.piUi&&root.piUi.toast&&root.piUi.toast(`Richiesta fallita dopo ${msg.attempt} tentativi`,"error"); } break;
        case "extension_ui_request": handleUiRequest(msg); break;
        case "pi-exit": if(msg.info&&!msg.info.expected) root.piUi&&root.piUi.toast&&root.piUi.toast("Il processo pi si è chiuso. Ripartirà al prossimo comando.","warn",6000); setUserMessageStatus(state.activeUserMessage,"error"); state.activeUserMessage=null; setBusy(false); break;
        default: break;
      }
    }
    function bind() { api.on("pi:event", handleEvent); }
    return { handleEvent, bind };
  }
  root.piRuntimeEvents = { createRuntimeEvents };
  if (typeof module!=="undefined"&&module.exports) module.exports={ createRuntimeEvents };
})(typeof window!=="undefined"?window:globalThis);
