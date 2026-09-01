"use strict";
// Session view: caching + loading + rendering conversation. Extracted from app.js
(function(){
  const el = window.piStore?.el;
  const state = window.piStore?.state;
  const api = window.piDesktop;
  function t(k,v){ return window.i18n ? window.i18n.t(k,v) : String(k); }

  const sessionMessageCache = new Map();
  const SESSION_CACHE_MAX = 60;
  // I nodi DOM (tool card, SVG, listener) pesano molto piu' dei messaggi raw:
  // l'LRU dei messaggi resta a 60, ma i nodi vivi vengono conservati solo per
  // le sessioni piu' recenti. Al di fuori, restoreCachedSessionDom cade sul
  // re-render dal canvas dei messaggi.
  const SESSION_DOM_CACHE_MAX = 12;
  const domCacheOrder = [];
  let openingSessionTimer = null;
  const OPENING_SESSION_TIMEOUT_MS = 120_000;

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
    for(const k of cacheKeysFor(file,tabId)){
      const idx=domCacheOrder.indexOf(k);
      if(idx>=0) domCacheOrder.splice(idx,1);
      domCacheOrder.push(k);
    }
    while(domCacheOrder.length > SESSION_DOM_CACHE_MAX){
      const evicted=sessionMessageCache.get(domCacheOrder.shift());
      if(evicted) evicted.nodes=null;
    }
    return true;
  }
  function restoreCachedSessionDom(file, tabId=null){
    const entry=getCachedSessionSnapshot(file,tabId);
    if(!entry || !Array.isArray(entry.nodes) || !el.messages) return null;
    if(window.piChat?.clearChat) window.piChat.clearChat();
    else { el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear(); }
    el.messages.replaceChildren(...entry.nodes);
    window.piUi?.jumpToBottom?.();
    // la sessione appena ripristinata e' la piu' recente nell'LRU dei nodi
    for(const k of cacheKeysFor(file,tabId)){
      const idx=domCacheOrder.indexOf(k);
      if(idx>=0){ domCacheOrder.splice(idx,1); domCacheOrder.push(k); }
    }
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
    if (openingSessionTimer) clearTimeout(openingSessionTimer);
    openingSessionTimer = setTimeout(() => {
      if (state.openingSessionFile === file) clearSessionLoading();
    }, OPENING_SESSION_TIMEOUT_MS);
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
    if (openingSessionTimer) {
      clearTimeout(openingSessionTimer);
      openingSessionTimer = null;
    }
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
    const rawVisibleCount=(msgs.messages||[]).length;
    const shouldExpandHistory = Boolean(msgs.truncated && msgs.hiddenCount);
    state.activeSessionFile=current.sessionFile||null;
    state.activeTabId=current.tabId||state.activeTabId;
    resetHistoryState(state.activeSessionFile, rawVisibleCount, shouldExpandHistory ? msgs.hiddenCount : 0);
    const domEmpty = !el.messages?.childNodes?.length || Boolean(el.messages?.querySelector?.(".chat-loading"));
    const identical = Array.isArray(paintedCache) && messagesEqual(paintedCache, displayMessages) && !domEmpty;
    if(!identical){
      const painted=await renderConversation(displayMessages,isCurrent);
      if(painted===false||!isCurrent()) return false;
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
        if (preview?.loadError) window.piUi?.toast?.(t("toast.sessionLoadError"), "error", 6500);
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
  // --- Cronologia progressiva (#perf): le chat lunghe aprono con la finestra
  // runtime (~100 messaggi). Scorrendo verso l'alto si caricano chunk dal file
  // JSONL completo, senza materializzare migliaia di nodi DOM all'apertura.
  const historyState = { file: null, start: -1, visibleCount: 0, loading: false };
  const HISTORY_CHUNK = 150;

  function resetHistoryState(file, visibleCount = 0, hiddenCount = 0) {
    historyState.file = file || null;
    historyState.start = -1;
    historyState.visibleCount = visibleCount;
    historyState.hiddenRemaining = hiddenCount;
    historyState.loading = false;
  }

  async function ensureHistoryStart(file) {
    if (!file || historyState.start >= 0) return historyState.start;
    const countRes = await api.sessionMessageCount?.(file).catch(() => null);
    const total = Number(countRes?.count) || 0;
    if (!total) return -1;
    historyState.start = Math.max(0, total - historyState.visibleCount);
    return historyState.start;
  }

  async function loadOlderHistory() {
    const s = state;
    const file = s.activeSessionFile;
    const c = el.chat || document.querySelector("#chat");
    if (!file || !c || historyState.loading) return null;
    const msgsElNow = el.messages || document.querySelector("#messages");
    if (!msgsElNow || msgsElNow.children.length === 0) return null;
    if (historyState.file !== file) resetHistoryState(file, historyState.visibleCount, historyState.hiddenRemaining || 0);
    const g0 = s.switchGeneration;
    historyState.loading = true;
    try {
      const start = await ensureHistoryStart(file);
      if (g0 !== s.switchGeneration || start <= 0) return null;
      const from = Math.max(0, start - HISTORY_CHUNK);
      const count = start - from;
      if (count <= 0) return null;

      const page = await api.messagesRange?.(file, from, start).catch(() => null);
      if (g0 !== s.switchGeneration) return null;
      if (page?.loadError) {
        window.piUi?.toast?.(t("toast.sessionLoadError"), "error", 6500);
        return null;
      }
      const collapse = window.piChatUtils?.collapseRetryAttempts ?? ((messages) => messages);
      const chunk = collapse(page?.messages || []);
      if (!chunk.length) {
        historyState.start = from;
        return count;
      }

      const results = new Map();
      for (const m of chunk) if (m.role === "toolResult" && m.toolCallId) results.set(m.toolCallId, m);
      const consumed = new Set();
      const renderFn = window.piChat?.renderFinalMessage || window.renderFinalMessage;
      const staging = document.createElement("div");
      const savedMsgs = el.messages;
      el.messages = staging;
      window.piUi?.pauseIconRefresh?.();
      try {
        for (let i = 0; i < chunk.length; i++) {
          try { renderFn(chunk[i], { results, consumed }); } catch { /* salta messaggi problematici */ }
        }
      } finally {
        window.piUi?.resumeIconRefresh?.();
        el.messages = savedMsgs;
      }
      if (!staging.firstChild) {
        historyState.start = from;
        return count;
      }

      const prevSH = c.scrollHeight, prevST = c.scrollTop;
      const wasStick = s.chatStickToBottom;
      s.chatStickToBottom = false;
      const frag = document.createDocumentFragment();
      while (staging.firstChild) frag.appendChild(staging.firstChild);
      savedMsgs.insertBefore(frag, savedMsgs.firstChild);
      c.scrollTop = c.scrollHeight - prevSH + prevST;
      s.chatStickToBottom = wasStick;
      historyState.start = from;
      historyState.hiddenRemaining = Math.max(0, from);
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
