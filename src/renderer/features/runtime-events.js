"use strict";
(function (root) {
  const NOTIF_ENABLED_KEY = "pi-desktop-notifications-enabled";
  const NOTIF_SOUND_KEY = "pi-desktop-notifications-sound";
  function isNotificationsEnabled(storage) {
    try {
      const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!s) return true;
      const v = s.getItem(NOTIF_ENABLED_KEY);
      if (v === null) return true;
      return v !== "false" && v !== "0";
    } catch { return true; }
  }
  function isSoundEnabled(storage) {
    try {
      const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!s) return false;
      return s.getItem(NOTIF_SOUND_KEY) === "true";
    } catch { return false; }
  }
  function shouldNotify(options = {}) {
    const enabled = options.enabled !== undefined ? options.enabled : isNotificationsEnabled(options.storage);
    if (!enabled) return false;
    const hidden = options.documentHidden !== undefined ? options.documentHidden : (typeof document !== "undefined" ? Boolean(document.hidden) : false);
    let focused;
    if (options.windowFocused !== undefined) focused = Boolean(options.windowFocused);
    else if (typeof document !== "undefined" && typeof document.hasFocus === "function") focused = Boolean(document.hasFocus());
    else focused = !hidden;
    return Boolean(hidden || !focused);
  }
  function buildNotificationPayload(msg, opts = {}) {
    const tr = opts.t || ((k) => k);
    let title = "Pi Desktop";
    let body = "";
    if (msg.type === "agent_settled" || msg.type === "agent_end") {
      title = tr("notification.agentDone", null) && tr("notification.agentDone") !== "notification.agentDone" ? tr("notification.agentDone") : "Agente completato";
      body = msg.isError || msg.error ? String(msg.error || "Errore") : (tr("notification.agentDoneBody") !== "notification.agentDoneBody" ? tr("notification.agentDoneBody") : "Pi ha finito il turno.");
    } else if (msg.type === "turn_end") {
      title = tr("notification.turnDone") !== "notification.turnDone" ? tr("notification.turnDone") : "Turno completato";
      body = "Turno completato.";
    } else {
      title = "Pi Desktop";
      body = String(msg.type || "");
    }
    return { title, body };
  }
  function playNotificationSound() {
    try {
      if (!isSoundEnabled()) return;
      const AudioCtor = (typeof window !== "undefined" && window.Audio) || (typeof globalThis !== "undefined" && globalThis.Audio);
      if (!AudioCtor) return;
      const audio = new AudioCtor("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==");
      audio.volume = 0.4;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }
  function showNotification(msg) {
    try {
      if (!shouldNotify()) return;
      const payload = buildNotificationPayload(msg, { t: (root.i18n && root.i18n.t) ? root.i18n.t : (k) => k });
      const Notif = (typeof window !== "undefined" && window.Notification) || (typeof globalThis !== "undefined" && globalThis.Notification);
      if (!Notif) return;
      if (Notif.permission === "granted") {
        try { new Notif(payload.title, { body: payload.body }); } catch {}
        playNotificationSound();
      } else if (Notif.permission !== "denied" && typeof Notif.requestPermission === "function") {
        Notif.requestPermission().then((perm) => {
          if (perm === "granted") {
            try { new Notif(payload.title, { body: payload.body }); } catch {}
            playNotificationSound();
          }
        }).catch(() => {});
      }
    } catch {}
  }
  function createRuntimeEvents({ state, el, api, t, icon, escapeHtml, textOfBlocks, compactToolArgs, fullToolArgs, toolIconName, makeToolCard, setToolCardResult, renderBlockMedia, beginStreamAssistant, streamApplyDelta, endStreamAssistant, setBusy, setUserMessageStatus, refreshStats, refreshSessionsSoon, refreshTabsSoon, refreshIcons, renderQueuePanel, renderTabs, renderProjects, updateNavigationStatus, handleUiRequest, scheduleScroll }) {
    function handleEvent(msg) {
      if (msg.tabId) {
        if (["agent_start","message_start","message_update","message_end","tool_execution_start","tool_execution_update","tool_execution_end"].includes(msg.type)) {
          root.piSessionView?.markActiveCacheDirty?.(msg.tabId);
        }
        const tab = state.tabs.find((c) => c.id === msg.tabId);
        if (tab) {
          if (msg.type === "agent_start") tab.busy = true;
          if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "pi-started") tab.busy = false;
          if (msg.type === "tab_status") tab.busy = Boolean(msg.busy);
          renderTabs();
          if (updateNavigationStatus) updateNavigationStatus(msg.tabId);
          else renderProjects();
        }
        if (state.activeTabId && msg.tabId !== state.activeTabId && msg.type !== "extension_ui_request") {
          if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "tab_status") { refreshSessionsSoon(); refreshTabsSoon(); }
          return;
        }
      }
      switch (msg.type) {
        case "agent_start": state.lastAssistantErrored=false; state.lastAssistantErrorWrap=null; state.retryAttempt=0; setBusy(true); setUserMessageStatus(state.activeUserMessage,"processing"); break;
        case "agent_settled": setUserMessageStatus(state.activeUserMessage, state.lastAssistantErrored?"failed":"done"); state.activeUserMessage=null; state.lastAssistantErrorWrap=null; state.retryAttempt=0; setBusy(false); refreshStats(); refreshSessionsSoon(); root.piSessionView?.refreshSessionCache?.(msg.tabId); showNotification(msg); break;
        case "message_start":
          if (msg.message?.role==="assistant") { setUserMessageStatus(state.activeUserMessage,"processing"); beginStreamAssistant(); }
          else if (msg.message?.role==="user") { const txt=textOfBlocks(msg.message.content); const idx=state.queuedUserMessages.findIndex(e=>e.message===txt); if(idx>=0){ const [entry]=state.queuedUserMessages.splice(idx,1); state.activeUserMessage=entry.userMessage; setUserMessageStatus(entry.userMessage,"processing"); } }
          break;
        case "message_update": streamApplyDelta(msg); break;
        case "message_end": endStreamAssistant(msg.message); break;
        case "turn_end": refreshStats(); showNotification(msg); break;
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
  // Direct global binding used by app.js — resolves deps via window at call time.
  function bindGlobalPiEvents() {
    const api = root.piDesktop;
    const el = root.piStore ? root.piStore.el : {};
    const state = root.piStore ? root.piStore.state : {};
    const t = root.i18n ? root.i18n.t : (k,v)=>k;
    function icon(n){ return root.piUi?root.piUi.icon(n):`<i data-lucide="${n}"></i>`; }
    function escapeHtml(s){ return root.piUtils?root.piUtils.escapeHtml(s):String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
    function textOfBlocks(c){ return root.piUtils?root.piUtils.textOfBlocks(c): (typeof c==="string"?c:""); }
    function toolIconName(n){ return root.piUtils?root.piUtils.toolIconName(n):"wrench"; }
    function compactToolArgs(n,a){ return root.piForms?root.piForms.compactToolArgs(n,a,state.settings?.cwd): String(a||"").slice(0,160); }
    function fullToolArgs(a){ return root.piUtils?root.piUtils.fullToolArgs(a): String(a||""); }
    function setUserMessageStatus(w,s){ return root.piMedia?root.piMedia.setUserMessageStatus(w,s): (window.setUserMessageStatus?window.setUserMessageStatus(w,s):void 0); }
    function makeToolCard(n,pr,pa){ return root.piMedia?root.piMedia.makeToolCard(n,pr,pa): (window.makeToolCard?window.makeToolCard(n,pr,pa):null); }
    function setToolCardResult(c,tx,er,co){ return root.piMedia?root.piMedia.setToolCardResult(c,tx,er,co): (window.setToolCardResult?window.setToolCardResult(c,tx,er,co):void 0); }
    function renderBlockMedia(p,c,pr){ return root.piMedia?root.piMedia.renderBlockMedia(p,c,pr): (window.renderBlockMedia?window.renderBlockMedia(p,c,pr):void 0); }
    function beginStreamAssistant(){ return root.piChat?root.piChat.beginStreamAssistant(): (window.beginStreamAssistant?window.beginStreamAssistant():void 0); }
    function streamApplyDelta(m){ return root.piChat?root.piChat.streamApplyDelta(m): (window.streamApplyDelta?window.streamApplyDelta(m):void 0); }
    function endStreamAssistant(m){ return root.piChat?root.piChat.endStreamAssistant(m): (window.endStreamAssistant?window.endStreamAssistant(m):void 0); }
    function setBusy(b,opts){ const fn=root.piComposer?root.piComposer.setBusy: window.setBusy; return fn?fn(b,opts):void 0; }
    function refreshStats(){ const fn=root.piComposer?root.piComposer.refreshStats: window.refreshStats; return fn?fn():void 0; }
    function refreshSessionsSoon(){ const fn=root.piSidebar?root.piSidebar.refreshSessionsSoon: window.refreshSessionsSoon; return fn?fn():void 0; }
    function refreshTabsSoon(){ const fn=root.piSidebar?root.piSidebar.refreshTabsSoon: window.refreshTabsSoon; return fn?fn():void 0; }
    function renderQueuePanel(){ const fn=root.piComposer?root.piComposer.renderQueuePanel: window.renderQueuePanel; return fn?fn():void 0; }
    function renderTabs(){ const fn=root.piSidebar?root.piSidebar.renderTabs: window.renderTabs; return fn?fn():void 0; }
    function renderProjects(){ const fn=root.piSidebar?root.piSidebar.renderProjects: window.renderProjects; return fn?fn():void 0; }
    function updateNavigationStatus(tabId){ const fn=root.piSidebar?.updateNavigationStatus; return fn?fn(tabId):renderProjects(); }
    function handleUiRequest(msg){ const fn=root.piExtensionBridge?root.piExtensionBridge.handleUiRequest: window.handleUiRequest; return fn?fn(msg):void 0; }
    function scheduleScroll(){ return root.piUi?root.piUi.scheduleScroll():void 0; }
    function toolDisplayName(n){ const fn=root.piChat?root.piChat.toolDisplayName: null; return fn?fn(n): (n||"tool"); }
    function toast(m,k,ms){ return root.piUi?root.piUi.toast(m,k,ms):void 0; }
    function handleEvent(msg){
      if (msg.tabId) {
        if (["agent_start","message_start","message_update","message_end","tool_execution_start","tool_execution_update","tool_execution_end"].includes(msg.type)) {
          root.piSessionView?.markActiveCacheDirty?.(msg.tabId);
        }
        const tab = state.tabs.find((c) => c.id === msg.tabId);
        if (tab) {
          if (msg.type === "agent_start") tab.busy = true;
          if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "pi-started") tab.busy = false;
          if (msg.type === "tab_status") tab.busy = Boolean(msg.busy);
          renderTabs(); updateNavigationStatus(msg.tabId);
        }
        if (state.activeTabId && msg.tabId !== state.activeTabId && msg.type !== "extension_ui_request") {
          if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "tab_status") { refreshSessionsSoon(); refreshTabsSoon(); }
          return;
        }
      }
      switch (msg.type) {
        case "agent_start": state.lastAssistantErrored=false; state.lastAssistantErrorWrap=null; state.retryAttempt=0; setBusy(true); setUserMessageStatus(state.activeUserMessage,"processing"); break;
        case "agent_settled": setUserMessageStatus(state.activeUserMessage, state.lastAssistantErrored?"failed":"done"); state.activeUserMessage=null; state.lastAssistantErrorWrap=null; state.retryAttempt=0; setBusy(false); refreshStats(); refreshSessionsSoon(); root.piSessionView?.refreshSessionCache?.(msg.tabId); showNotification(msg); break;
        case "message_start":
          if (msg.message?.role==="assistant") { setUserMessageStatus(state.activeUserMessage,"processing"); beginStreamAssistant(); }
          else if (msg.message?.role==="user") { const txt=textOfBlocks(msg.message.content); const idx=state.queuedUserMessages.findIndex(e=>e.message===txt); if(idx>=0){ const [entry]=state.queuedUserMessages.splice(idx,1); state.activeUserMessage=entry.userMessage; setUserMessageStatus(entry.userMessage,"processing"); } }
          break;
        case "message_update": streamApplyDelta(msg); break;
        case "message_end": endStreamAssistant(msg.message); break;
        case "turn_end": refreshStats(); showNotification(msg); break;
        case "tool_execution_start": { const name=msg.toolName||"tool"; const card=state.tools.get(msg.toolCallId)||makeToolCard(name, compactToolArgs(name,msg.args)); card.dataset.tool=name.toLowerCase(); const nEl=card.querySelector(".tool-name"); if(nEl) nEl.innerHTML=`${icon(toolIconName(name))} ${escapeHtml(toolDisplayName(name))}`; const a=card.querySelector(".tool-args"); if(a){ a.textContent=compactToolArgs(name,msg.args); a.title=fullToolArgs(msg.args); } state.tools.set(msg.toolCallId,card); if(root.piUi) root.piUi.refreshIcons(); break; }
        case "tool_execution_update": { const card=state.tools.get(msg.toolCallId); if(card){ const pre=card.querySelector(".tool-body pre"); if(pre) pre.textContent=textOfBlocks(msg.partialResult?.content); renderBlockMedia(card.querySelector(".tool-body"), msg.partialResult?.content, "Anteprima"); } break; }
        case "tool_execution_end": { const card=state.tools.get(msg.toolCallId); if(card){ setToolCardResult(card, textOfBlocks(msg.result?.content), Boolean(msg.isError), msg.result?.content); state.tools.delete(msg.toolCallId); } break; }
        case "bash_execution_update": { if(state.directBashCard){ const pre=state.directBashCard.querySelector(".tool-body pre"); if(pre) pre.textContent+=(msg.delta||""); scheduleScroll(); } break; }
        case "queue_update": state.nativeQueue={steering:msg.steering||[], followUp:msg.followUp||[]}; renderQueuePanel(); break;
        case "compaction_start": el.statusActivity.textContent="compazione del contesto…"; break;
        case "compaction_end": el.statusActivity.textContent=""; toast("Contesto compattato.","info"); break;
        case "auto_retry_start": state.lastAssistantErrorWrap?.remove(); state.lastAssistantErrorWrap=null; state.lastAssistantErrored=false; state.retryAttempt=msg.attempt||state.retryAttempt+1; el.statusActivity.textContent=`errore transitorio — retry ${msg.attempt}/${msg.maxAttempts}`; setUserMessageStatus(state.activeUserMessage,"retrying"); if (state.activeUserMessage?.isConnected) { const stEl=state.activeUserMessage.querySelector(".message-status"); const receivedAt=state.activeUserMessage.dataset.receivedAt; if (stEl) stEl.textContent=`ricevuto${receivedAt?` alle ${receivedAt}`:""} · provider non disponibile, tentativo ${msg.attempt}/${msg.maxAttempts}…`; } break;
        case "auto_retry_end": el.statusActivity.textContent=state.busy?"agente al lavoro…":""; if(msg.success){ state.lastAssistantErrored=false; setUserMessageStatus(state.activeUserMessage,"processing"); } else { state.lastAssistantErrored=true; setUserMessageStatus(state.activeUserMessage,"failed"); toast(`Richiesta fallita dopo ${msg.attempt} tentativi`,"error"); } break;
        case "summarization_retry_scheduled": el.statusActivity.textContent=`riepilogo in retry ${msg.attempt}/${msg.maxAttempts}`; break;
        case "summarization_retry_attempt_start": el.statusActivity.textContent="nuovo tentativo di riepilogo…"; break;
        case "summarization_retry_finished": el.statusActivity.textContent=state.busy?"agente al lavoro…":""; break;
        case "extension_error": toast(`Estensione in errore: ${msg.error}`,"error"); break;
        case "extension_ui_request": handleUiRequest(msg); break;
        case "pi-exit": if(msg.info&&!msg.info.expected) toast("Il processo pi si è chiuso. Ripartirà al prossimo comando.","warn",6000); setUserMessageStatus(state.activeUserMessage,"error"); state.activeUserMessage=null; setBusy(false); break;
        default: break;
      }
    }
    if (api && api.on) api.on("pi:event", handleEvent);
    return handleEvent;
  }
  root.piRuntimeEvents = { createRuntimeEvents, bindGlobalPiEvents, shouldNotify, buildNotificationPayload, showNotification, isNotificationsEnabled, isSoundEnabled };
  if (typeof module!=="undefined"&&module.exports) module.exports={ createRuntimeEvents, bindGlobalPiEvents, shouldNotify, buildNotificationPayload, showNotification, isNotificationsEnabled, isSoundEnabled, NOTIF_ENABLED_KEY, NOTIF_SOUND_KEY };
})(typeof window!=="undefined"?window:globalThis);
