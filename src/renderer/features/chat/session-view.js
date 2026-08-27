"use strict";
// Session view: caching + loading + rendering conversation. Extracted from app.js
(function(){
  const el = window.piStore?.el;
  const state = window.piStore?.state;
  const api = window.piDesktop;
  function t(k,v){ return window.i18n ? window.i18n.t(k,v) : String(k); }

  const sessionMessageCache = new Map();
  const SESSION_CACHE_MAX = 60;

  function cacheKeysFor(file, tabId){
    return [...new Set([
      file || null,
      tabId ? `tab:${tabId}` : null,
    ].filter(Boolean))];
  }
  function getCachedSessionSnapshot(file, tabId=null, {allowDirty=false}={}){
    const keys=cacheKeysFor(file,tabId);
    for(const key of keys){
      const entry=sessionMessageCache.get(key);
      if(!entry || (entry.dirty && !allowDirty)) continue;
      entry.at=Date.now();
      return entry;
    }
    return null;
  }
  function getCachedSessionMessages(file, tabId=null, options){
    return getCachedSessionSnapshot(file,tabId,options)?.messages || null;
  }
  function cacheSessionMessages(file, messages, tabId=null){
    if(!Array.isArray(messages)) return;
    const explicitTabId=tabId || null;
    const keys=cacheKeysFor(file,explicitTabId);
    if(!keys.length) return;
    const at = Date.now();
    const entry={messages,at,dirty:false,file:file||null,tabId:explicitTabId};
    for(const k of keys){
      sessionMessageCache.set(k,entry);
    }
    while(sessionMessageCache.size > SESSION_CACHE_MAX){
      let oldestKey=null, oldestAt=Infinity;
      for(const [k,v] of sessionMessageCache){
        if(!keys.includes(k) && v.at<oldestAt){oldestAt=v.at; oldestKey=k;}
      }
      if(oldestKey) sessionMessageCache.delete(oldestKey);
      else break;
    }
  }
  function cacheSessionDom(file, tabId=null){
    const entry=getCachedSessionSnapshot(file,tabId,{allowDirty:true});
    if(!entry || !el.messages) return false;
    entry.nodes=[...el.messages.childNodes];
    return true;
  }
  function restoreCachedSessionDom(file, tabId=null){
    const entry=getCachedSessionSnapshot(file,tabId);
    if(!entry || !Array.isArray(entry.nodes) || !el.messages) return null;
    if(window.piChat?.clearChat) window.piChat.clearChat();
    else { el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear(); }
    el.messages.replaceChildren(...entry.nodes);
    window.piUi?.jumpToBottom?.();
    return entry.messages;
  }
  function markSessionCacheDirty(file,tabId=null){
    for(const key of cacheKeysFor(file,tabId)){
      const entry=sessionMessageCache.get(key);
      if(entry) entry.dirty=true;
    }
  }
  function markActiveCacheDirty(tabId=state.activeTabId){
    const tab=state.tabs?.find?.((candidate)=>candidate.id===tabId);
    markSessionCacheDirty(tab?.sessionFile || (tabId===state.activeTabId ? state.activeSessionFile : null),tabId);
  }
  async function refreshSessionCache(tabId=state.activeTabId){
    if(!tabId) return false;
    try{
      const [msgs,current]=await Promise.all([api.getMessages(tabId),api.getState(tabId)]);
      const displayMessages=window.piChatUtils.collapseRetryAttempts(msgs.messages||[]);
      cacheSessionMessages(current.sessionFile||null,displayMessages,current.tabId||tabId);
      return true;
    }catch{return false;}
  }
  function messagesEqual(a,b){
    if(!Array.isArray(a) || !Array.isArray(b)) return false;
    if(a.length!==b.length) return false;
    try{
      if(window.piUtils?.messageListStats){
        const ha=window.piUtils.messageListStats(a);
        const hb=window.piUtils.messageListStats(b);
        return ha.revision===hb.revision && ha.bytes===hb.bytes;
      }
    }catch{}
    try{ return JSON.stringify(a)===JSON.stringify(b); }catch{ return false; }
  }
  function setSessionLoading(file, {showSkeleton=true}={}){
    state.openingSessionFile=file;
    document.body.classList.add("session-loading");
    if(el.chat) {
      el.chat.classList.add("session-loading");
      el.chat.classList.toggle("session-preview-ready", !showSkeleton);
    }
    if(el.statusActivity) el.statusActivity.textContent=t("session.loadingChat");
    if(!showSkeleton) return;
    el.messages.innerHTML="";
    state.streamAssistant=null; state.tools.clear();
    el.emptyState.classList.add("hidden");
    if(window.piUi?.setConversationMode) window.piUi.setConversationMode(true,false);
    const skel=document.createElement("div");
    skel.className="chat-loading";
    skel.innerHTML=`<div class="chat-loading-header"><span class="spin"></span><span>Caricamento conversazione…</span></div><div class="skeleton-block"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>`;
    el.messages.appendChild(skel);
    if(window.piSidebar?.renderProjects) window.piSidebar.renderProjects();
  }
  function clearSessionLoading(){
    state.openingSessionFile=null;
    document.body.classList.remove("session-loading");
    if(el.chat) el.chat.classList.remove("session-loading", "session-preview-ready");
    if(!state.busy && el.statusActivity) el.statusActivity.textContent="";
    if(window.piSidebar?.renderProjects) window.piSidebar.renderProjects();
  }
  function nextFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }
  async function renderConversation(displayMessages, isCurrent=()=>true){
    const results=new Map();
    for(const m of displayMessages) if(m.role==="toolResult" && m.toolCallId) results.set(m.toolCallId,m);
    const consumed=new Set();
    const renderFn = window.piChat?.renderFinalMessage || window.renderFinalMessage;
    if(typeof renderFn !== "function"){
      console.error("renderFinalMessage mancante", window.piChat);
      throw new Error("renderFinalMessage non disponibile");
    }
    const liveMessages=el.messages;
    const staging=document.createElement("div");
    el.messages=staging;
    let completed=false;
    window.piChat?.beginBulkRender?.();
    try{
      let lastYield=performance.now();
      for(let i=0;i<displayMessages.length;i++){
        if(!isCurrent()) return false;
        try { renderFn(displayMessages[i],{results, consumed}); }
        catch(err){ console.error("renderFinalMessage fallita", err); }
        if(i+1<displayMessages.length && performance.now()-lastYield>16){
          await nextFrame();
          lastYield=performance.now();
          if(!isCurrent()) return false;
        }
      }
      completed=true;
    }finally{
      window.piChat?.endBulkRender?.();
      el.messages=liveMessages;
    }
    if(!completed||!isCurrent()) return false;
    if(window.piChat?.clearChat) window.piChat.clearChat();
    else { liveMessages.innerHTML=""; state.streamAssistant=null; state.tools.clear(); }
    // Move via fragment: niente spread di migliaia di nodi come argomenti
    // (limiti di stack/arita') e un'unica inserzione nel DOM reale.
    const moveFrag=document.createDocumentFragment();
    while(staging.firstChild) moveFrag.appendChild(staging.firstChild);
    liveMessages.appendChild(moveFrag);
    window.piUi?.refreshIcons?.();
    return true;
  }
  async function reloadConversationFromRuntime({restoreTab=false, contextRestored=false, paintedCache=null, switchGeneration=null, pinToBottom=false}={}){
    const requestedTabId=state.activeTabId;
    const isCurrent=()=>
      (switchGeneration==null || switchGeneration===state.switchGeneration) &&
      (!requestedTabId || requestedTabId===state.activeTabId);
    const [msgs, current]=await Promise.all([api.getMessages(requestedTabId), api.getState(requestedTabId)]);
    if(!isCurrent()) return false;
    if(msgs.loadError){
      window.piUi?.toast?.(t("toast.sessionLoadError"), "error", 6500);
      return false;
    }
    const displayMessages=window.piChatUtils.collapseRetryAttempts(msgs.messages||[]);
    const shouldExpandHistory = Boolean(msgs.truncated && msgs.hiddenCount);
    if(shouldExpandHistory){
      window.piUi?.toast?.(t("toast.sessionTruncated", { shown: displayMessages.length, hidden: msgs.hiddenCount }), "info", 5200);
    }
    state.activeSessionFile=current.sessionFile||null;
    state.activeTabId=current.tabId||state.activeTabId;
    const identical = Array.isArray(paintedCache) && messagesEqual(paintedCache, displayMessages);
    if(!identical){
      const painted=await renderConversation(displayMessages,isCurrent);
      if(painted===false||!isCurrent()) return false;
    }
    if(shouldExpandHistory && state.activeSessionFile){
      void expandTruncatedHistory(state.activeSessionFile, msgs.hiddenCount, switchGeneration);
    }
    cacheSessionMessages(state.activeSessionFile, displayMessages, state.activeTabId);
    cacheSessionDom(state.activeSessionFile, state.activeTabId);
    if(restoreTab && !contextRestored && window.piSidebar?.restoreActiveTabContext) window.piSidebar.restoreActiveTabContext();
    const hasContent=Boolean(displayMessages.length||state.localQueue.length);
    window.piUi?.setConversationMode(hasContent,false);
    el.emptyState.classList.toggle("hidden",hasContent);
    if(window.piComposer?.setBusy) window.piComposer.setBusy(Boolean(current.isStreaming),{dispatchQueue:false});
    if(current.isStreaming && !state.streamAssistant) window.piChat.beginStreamAssistant();
    if(restoreTab && !current.isStreaming && state.localQueue.length) queueMicrotask(()=>window.piComposer?.dispatchNextLocalMessage?.());
    if(pinToBottom) window.piUi?.jumpToBottom();
    else if(restoreTab) window.piSidebar?.restoreActiveTabScroll?.({fallbackToBottom:true});
    else window.piUi?.jumpToBottom();
    Promise.all([window.piSessionView?._refreshHeader?.() ?? Promise.resolve(), window.piComposer?.refreshStats?.() ?? Promise.resolve(), window.piSidebar?.refreshSessions?.() ?? Promise.resolve(), window.piSidebar?.refreshTabs?.() ?? Promise.resolve()]).catch(()=>{});
    return true;
  }
  async function openHistorySession(session){
    if(state.creatingChat) return;
    const generation=++state.switchGeneration;
    try { historyState.file = null; } catch {} // la storia progressiva riparte pulita
    window.piSidebar?.stashActiveTabContext?.();
    let painted=null;
    let stage="open";
    try{
      const cachedSnapshot=getCachedSessionSnapshot(session.file);
      const cached=cachedSnapshot?.messages||null;
      setSessionLoading(session.file,{showSkeleton:!cached});
      window.piComposer?.resetQueueState?.(); window.piComposer?.setBusy(false);
      const openedPromise=api.openSession(session.file, session.cwd, session.preference, session.name||session.preview);
      const settingsPromise=session.cwd && session.cwd!==state.settings?.cwd
        ? api.activateProject(session.cwd)
        : Promise.resolve(null);
      state.expandedProjects.add(session.cwd);
      if(cached){
        stage="cache";
        el.emptyState.classList.add("hidden"); window.piUi?.setConversationMode(true,false);
        const restored=restoreCachedSessionDom(session.file);
        if(!restored) {
          await renderConversation(cached,()=>generation===state.switchGeneration);
          cacheSessionDom(session.file);
          window.piUi?.jumpToBottom?.();
        }
        if(generation!==state.switchGeneration) return;
        painted=cached;
      } else if(typeof api.previewSession==="function") {
        stage="preview";
        const preview=await api.previewSession(session.file).catch(()=>null);
        if(generation!==state.switchGeneration) return;
        const previewMessages=window.piChatUtils.collapseRetryAttempts(preview?.messages||[]);
        if(previewMessages.length){
          await renderConversation(previewMessages,()=>generation===state.switchGeneration);
          if(generation!==state.switchGeneration) return;
          cacheSessionMessages(session.file,previewMessages);
          cacheSessionDom(session.file);
          painted=previewMessages;
          window.piUi?.setConversationMode(true,false);
          el.emptyState.classList.add("hidden");
          el.chat?.classList.add("session-preview-ready");
          window.piUi?.jumpToBottom?.();
        }
      }
      stage="runtime";
      const [opened, settings]=await Promise.all([openedPromise, settingsPromise]);
      if(generation!==state.switchGeneration) return;
      if(settings) state.settings=settings;
      state.commands=[]; state.activeTabId=opened.tabId||state.activeTabId; state.activeSessionFile=session.file;
      el.statusCwd.textContent=session.cwd||"";
      stage="render";
      const loaded=await reloadConversationFromRuntime({restoreTab:true, paintedCache:painted, switchGeneration:generation, pinToBottom:true});
      if(loaded) painted=painted||true;
      if(generation===state.switchGeneration) {
        try { await window.piUi?.waitUntilPinnedToBottom?.(); }
        catch (err) { console.warn("[openHistorySession] pin", err); }
      }
    }catch(err){
      console.error("[openHistorySession]", stage, err);
      if(generation!==state.switchGeneration) return;
      if(!painted){
        if(window.piChat?.clearChat) window.piChat.clearChat(); else el.messages.innerHTML="";
        el.emptyState.classList.remove("hidden"); window.piUi?.setConversationMode(false,false);
      }
      window.piUi?.toast(t("toast.openSessionFail", { msg: `${stage}: ${err.message}` }),"error");
    }finally{
      if(generation===state.switchGeneration) clearSessionLoading();
    }
  }
  // --- Cronologia progressiva (#perf): le chat lunghissime aprono con la
  // finestra di contesto del runtime (ultimi ~100 messaggi). Scrollando in cima,
  // i messaggi piu' vecchi vengono precaricati a chunk dal file JSONL completo
  // (gia' letto da sessions:preview), mantenendo l'ancora di scroll.
  const historyState = { file: null, full: null, start: -1, loading: false };
  const HISTORY_CHUNK = 150;

  async function ensureFullHistory(file) {
    if (historyState.file === file && historyState.full) return historyState.full;
    const preview = await api.messagesPage(file, 6000).catch(() => null);
    const raw = preview?.messages || [];
    const full = (window.piChatUtils?.collapseRetryAttempts ?? ((m) => m))(raw);
    historyState.file = file;
    historyState.full = full;
    historyState.start = -1;
    return full;
  }

  async function expandTruncatedHistory(file, hiddenCount, switchGeneration) {
    if (!file || !hiddenCount) return;
    let remaining = hiddenCount;
    for (let guard = 0; remaining > 0 && guard < 40; guard += 1) {
      if (switchGeneration != null && switchGeneration !== state.switchGeneration) return;
      if (state.activeSessionFile !== file) return;
      const loaded = await loadOlderHistory();
      if (!loaded || loaded <= 0) break;
      remaining -= loaded;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function loadOlderHistory() {
    const s = state;
    const file = s.activeSessionFile;
    const c = el.chat || document.querySelector("#chat");
    if (!file || !c || historyState.loading) return null;
    // Guardia sul DOM reale: serve una conversazione gia' renderizzata
    const msgsElNow = el.messages || document.querySelector("#messages");
    if (!msgsElNow || msgsElNow.children.length === 0) return null;
    const g0 = s.switchGeneration;
    historyState.loading = true;
    try {
      const full = await ensureFullHistory(file);
      if (g0 !== s.switchGeneration || !full.length) return null;
      if (historyState.start < 0) {
        // Allinea la finestra: quello che mostra il runtime sono gli ultimi N
        const gm = await api.getMessages(s.activeTabId);
        if (g0 !== s.switchGeneration) return null;
        const cur = gm && gm.messages ? gm.messages : (Array.isArray(gm) ? gm : []);
        historyState.start = Math.max(0, full.length - cur.length);
        if (historyState.start === 0) return null; // gia' a inizio file
      }
      const from = Math.max(0, historyState.start - HISTORY_CHUNK);
      const count = historyState.start - from;
      if (count <= 0) return null;

      // Pairing tool-call/result sull'intero storico, render su staging
      const results = new Map();
      for (const m of full) if (m.role === "toolResult" && m.toolCallId) results.set(m.toolCallId, m);
      const consumed = new Set();
      const renderFn = window.piChat?.renderFinalMessage || window.renderFinalMessage;
      const staging = document.createElement("div");
      const savedMsgs = el.messages;
      el.messages = staging;
      try {
        for (let i = from; i < historyState.start; i++) {
          try { renderFn(full[i], { results, consumed }); } catch { /* salta messaggi problematici */ }
        }
      } finally { el.messages = savedMsgs; }
      if (!staging.firstChild) { historyState.start = from; return count; }

      // Ancora di scroll: aggiungi sopra senza far saltare la viewport
      const prevSH = c.scrollHeight, prevST = c.scrollTop;
      const wasStick = s.chatStickToBottom;
      s.chatStickToBottom = false;
      const frag = document.createDocumentFragment();
      while (staging.firstChild) frag.appendChild(staging.firstChild);
      savedMsgs.insertBefore(frag, savedMsgs.firstChild);
      c.scrollTop = c.scrollHeight - prevSH + prevST;
      s.chatStickToBottom = wasStick;
      historyState.start = from;
      window.piUi?.refreshIcons?.();
      window.piUi?.updateScrollBottomVisibility?.();
      return count;
    } finally {
      historyState.loading = false;
    }
  }

  // Auto-trigger vicino allo scroll-top
  try {
    (el.chat || document.querySelector("#chat"))?.addEventListener("scroll", () => {
      const c = el.chat || document.querySelector("#chat");
      if (c && c.scrollTop <= 140) loadOlderHistory().catch(() => {});
    }, { passive: true });
  } catch {}

  // expose for app.js compat
  window.piSessionView={
    getCachedSessionSnapshot, getCachedSessionMessages, cacheSessionMessages,
    cacheSessionDom, restoreCachedSessionDom,
    markSessionCacheDirty, markActiveCacheDirty, refreshSessionCache,
    setSessionLoading, clearSessionLoading, renderConversation,
    reloadConversationFromRuntime, openHistorySession,
    loadOlderHistory,
    _refreshHeader: window.refreshHeaderFromState || null,
  };
  // also expose globals expected by inline handlers
  window.getCachedSessionMessages=getCachedSessionMessages;
  window.cacheSessionMessages=cacheSessionMessages;
  window.markSessionCacheDirty=markSessionCacheDirty;
  window.setSessionLoading=setSessionLoading;
  window.clearSessionLoading=clearSessionLoading;
  window.renderConversation=renderConversation;
  window.reloadConversationFromRuntime=reloadConversationFromRuntime;
  window.openHistorySession=openHistorySession;
})();
