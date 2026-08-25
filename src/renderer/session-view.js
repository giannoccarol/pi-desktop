"use strict";
// Session view: caching + loading + rendering conversation. Extracted from app.js
(function(){
  const el = window.piStore?.el;
  const state = window.piStore?.state;
  const api = window.piDesktop;
  function t(k,v){ return window.i18n ? window.i18n.t(k,v) : String(k); }

  const sessionMessageCache = new Map();
  const SESSION_CACHE_MAX = 30;

  function cacheKeyFor(file, tabId){
    if(file) return file;
    if(tabId) return `tab:${tabId}`;
    return null;
  }
  function getCachedSessionMessages(file, tabId=null){
    // supporta sia file che tabId (per draft senza file)
    const key = cacheKeyFor(file, tabId);
    if(!key) return null;
    // prova anche con tabId se file non trovato (fallback per draft migrati)
    let entry = sessionMessageCache.get(key);
    if(!entry && file && tabId) entry = sessionMessageCache.get(`tab:${tabId}`);
    if(!entry && tabId) entry = sessionMessageCache.get(tabId);
    return entry?.messages || null;
  }
  function cacheSessionMessages(file, messages, tabId=null){
    if(!Array.isArray(messages)) return;
    const keys = [];
    const primary = cacheKeyFor(file, tabId || state.activeTabId);
    if(primary) keys.push(primary);
    // per tab con file, tieni anche la chiave tab: per switch rapido anche se file cambia
    const tabKey = state.activeTabId ? `tab:${state.activeTabId}` : (tabId ? `tab:${tabId}` : null);
    if(tabKey && !keys.includes(tabKey)) keys.push(tabKey);
    if(!keys.length) return;
    const at = Date.now();
    for(const k of keys){
      sessionMessageCache.set(k,{messages, at});
    }
    while(sessionMessageCache.size > SESSION_CACHE_MAX){
      let oldestKey=null, oldestAt=Infinity;
      for(const [k,v] of sessionMessageCache){ if(v.at<oldestAt){oldestAt=v.at; oldestKey=k;}}
      if(oldestKey && !keys.includes(oldestKey)) sessionMessageCache.delete(oldestKey);
      else break;
    }
  }
  function messagesEqual(a,b){
    if(!Array.isArray(a) || !Array.isArray(b)) return false;
    if(a.length!==b.length) return false;
    try{
      if(window.piUtils?.messageListStats){
        const ha=window.piUtils.messageListStats(a);
        const hb=window.piUtils.messageListStats(b);
        return ha.hash===hb.hash && ha.bytes===hb.bytes;
      }
    }catch{}
    try{ return JSON.stringify(a)===JSON.stringify(b); }catch{ return false; }
  }
  function setSessionLoading(file, {showSkeleton=true}={}){
    state.openingSessionFile=file;
    document.body.classList.add("session-loading");
    if(el.statusActivity) el.statusActivity.textContent=t("session.loadingChat");
    if(!showSkeleton) return;
    if(el.chat) el.chat.classList.add("session-loading");
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
    if(el.chat) el.chat.classList.remove("session-loading");
    if(!state.busy && el.statusActivity) el.statusActivity.textContent="";
    if(window.piSidebar?.renderProjects) window.piSidebar.renderProjects();
  }
  function nextFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }
  async function renderConversation(displayMessages, isCurrent=()=>true){
    const results=new Map();
    for(const m of displayMessages) if(m.role==="toolResult" && m.toolCallId) results.set(m.toolCallId,m);
    const consumed=new Set(); const CHUNK=20;
    const renderFn = window.piChat?.renderFinalMessage || window.renderFinalMessage;
    if(typeof renderFn !== "function"){
      console.error("renderFinalMessage mancante", window.piChat);
      throw new Error("renderFinalMessage non disponibile");
    }
    for(let i=0;i<displayMessages.length;i++){
      if(!isCurrent()) return false;
      renderFn(displayMessages[i],{results, consumed});
      if((i+1)%CHUNK===0 && i+1<displayMessages.length){ window.piUi?.scheduleScroll(); await nextFrame(); }
    }
    return true;
  }
  async function reloadConversationFromRuntime({restoreTab=false, paintedCache=null, switchGeneration=null}={}){
    const isCurrent=()=>switchGeneration==null || switchGeneration===state.switchGeneration;
    const msgs=await api.getMessages();
    if(!isCurrent()) return false;
    const displayMessages=window.piChatUtils.collapseRetryAttempts(msgs.messages||[]);
    const current=await api.getState();
    if(!isCurrent()) return false;
    state.activeSessionFile=current.sessionFile||null;
    state.activeTabId=current.tabId||state.activeTabId;
    if(restoreTab && window.piSidebar?.restoreActiveTabContext) window.piSidebar.restoreActiveTabContext();
    const identical = Array.isArray(paintedCache) && messagesEqual(paintedCache, displayMessages);
    if(!identical){
      if(window.piChat?.clearChat) window.piChat.clearChat(); else { el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear(); }
      const painted=await renderConversation(displayMessages,isCurrent);
      if(painted===false||!isCurrent()) return false;
    }
    cacheSessionMessages(state.activeSessionFile, displayMessages, state.activeTabId);
    const hasContent=Boolean(displayMessages.length||state.localQueue.length);
    window.piUi?.setConversationMode(hasContent,false);
    el.emptyState.classList.toggle("hidden",hasContent);
    if(window.piComposer?.setBusy) window.piComposer.setBusy(Boolean(current.isStreaming),{dispatchQueue:false});
    if(current.isStreaming && !state.streamAssistant) window.piChat.beginStreamAssistant();
    if(restoreTab && !current.isStreaming && state.localQueue.length) queueMicrotask(()=>window.piComposer?.dispatchNextLocalMessage?.());
    window.piUi?.jumpToBottom();
    Promise.all([window.piSessionView?._refreshHeader?.() ?? Promise.resolve(), window.piComposer?.refreshStats?.() ?? Promise.resolve(), window.piSidebar?.refreshSessions?.() ?? Promise.resolve(), window.piSidebar?.refreshTabs?.() ?? Promise.resolve()]).catch(()=>{});
    return true;
  }
  async function openHistorySession(session){
    if(state.creatingChat) return;
    const generation=++state.switchGeneration;
    window.piSidebar?.stashActiveTabContext?.();
    try{
      const cached=getCachedSessionMessages(session.file);
      setSessionLoading(session.file,{showSkeleton:!cached});
      window.piComposer?.resetQueueState?.(); window.piComposer?.setBusy(false);
      state.settings=await api.activateProject(session.cwd);
      if(generation!==state.switchGeneration) return;
      state.expandedProjects.add(session.cwd);
      let painted=null;
      if(cached){
        el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear();
        el.emptyState.classList.add("hidden"); window.piUi?.setConversationMode(true,false);
        await renderConversation(cached,()=>generation===state.switchGeneration);
        if(generation!==state.switchGeneration) return;
        window.piUi?.jumpToBottom(); painted=cached;
      }
      const opened=await api.openSession(session.file, session.cwd, session.preference, session.name||session.preview);
      if(generation!==state.switchGeneration) return;
      state.commands=[]; state.activeTabId=opened.tabId||state.activeTabId; state.activeSessionFile=session.file;
      el.statusCwd.textContent=session.cwd||"";
      await reloadConversationFromRuntime({restoreTab:true, paintedCache:painted, switchGeneration:generation});
    }catch(err){
      if(generation!==state.switchGeneration) return;
      if(window.piChat?.clearChat) window.piChat.clearChat(); else el.messages.innerHTML="";
      el.emptyState.classList.remove("hidden"); window.piUi?.setConversationMode(false,false);
      window.piUi?.toast(`Impossibile aprire la sessione: ${err.message}`,"error");
    }finally{ if(generation===state.switchGeneration) clearSessionLoading(); }
  }
  // expose for app.js compat
  window.piSessionView={getCachedSessionMessages, cacheSessionMessages, setSessionLoading, clearSessionLoading, renderConversation, reloadConversationFromRuntime, openHistorySession, _refreshHeader: window.refreshHeaderFromState || null};
  // also expose globals expected by inline handlers
  window.getCachedSessionMessages=getCachedSessionMessages;
  window.cacheSessionMessages=cacheSessionMessages;
  window.setSessionLoading=setSessionLoading;
  window.clearSessionLoading=clearSessionLoading;
  window.renderConversation=renderConversation;
  window.reloadConversationFromRuntime=reloadConversationFromRuntime;
  window.openHistorySession=openHistorySession;
})();
