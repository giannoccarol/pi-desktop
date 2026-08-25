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
    if(el.chat) el.chat.classList.add("session-loading");
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
    if(el.chat) el.chat.classList.remove("session-loading");
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
    }finally{
      window.piChat?.endBulkRender?.();
    }
    return true;
  }
  async function reloadConversationFromRuntime({restoreTab=false, paintedCache=null, switchGeneration=null, pinToBottom=false}={}){
    const requestedTabId=state.activeTabId;
    const isCurrent=()=>
      (switchGeneration==null || switchGeneration===state.switchGeneration) &&
      (!requestedTabId || requestedTabId===state.activeTabId);
    const [msgs, current]=await Promise.all([api.getMessages(requestedTabId), api.getState(requestedTabId)]);
    if(!isCurrent()) return false;
    const displayMessages=window.piChatUtils.collapseRetryAttempts(msgs.messages||[]);
    state.activeSessionFile=current.sessionFile||null;
    state.activeTabId=current.tabId||state.activeTabId;
    const identical = Array.isArray(paintedCache) && messagesEqual(paintedCache, displayMessages);
    if(!identical){
      if(window.piChat?.clearChat) window.piChat.clearChat(); else { el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear(); }
      const painted=await renderConversation(displayMessages,isCurrent);
      if(painted===false||!isCurrent()) return false;
    }
    cacheSessionMessages(state.activeSessionFile, displayMessages, state.activeTabId);
    if(restoreTab && window.piSidebar?.restoreActiveTabContext) window.piSidebar.restoreActiveTabContext();
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
    window.piSidebar?.stashActiveTabContext?.();
    try{
      const cached=getCachedSessionMessages(session.file);
      setSessionLoading(session.file,{showSkeleton:!cached});
      window.piComposer?.resetQueueState?.(); window.piComposer?.setBusy(false);
      const openedPromise=api.openSession(session.file, session.cwd, session.preference, session.name||session.preview);
      const settingsPromise=api.activateProject(session.cwd);
      state.expandedProjects.add(session.cwd);
      let painted=null;
      if(cached){
        el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear();
        el.emptyState.classList.add("hidden"); window.piUi?.setConversationMode(true,false);
        await renderConversation(cached,()=>generation===state.switchGeneration);
        if(generation!==state.switchGeneration) return;
        painted=cached;
      }
      const [opened, settings]=await Promise.all([openedPromise, settingsPromise]);
      if(generation!==state.switchGeneration) return;
      if(settings) state.settings=settings;
      state.commands=[]; state.activeTabId=opened.tabId||state.activeTabId; state.activeSessionFile=session.file;
      el.statusCwd.textContent=session.cwd||"";
      await reloadConversationFromRuntime({restoreTab:true, paintedCache:painted, switchGeneration:generation, pinToBottom:true});
      if(generation===state.switchGeneration) await window.piUi?.waitUntilPinnedToBottom?.();
    }catch(err){
      if(generation!==state.switchGeneration) return;
      if(window.piChat?.clearChat) window.piChat.clearChat(); else el.messages.innerHTML="";
      el.emptyState.classList.remove("hidden"); window.piUi?.setConversationMode(false,false);
      window.piUi?.toast(`Impossibile aprire la sessione: ${err.message}`,"error");
    }finally{
      if(generation===state.switchGeneration) clearSessionLoading();
    }
  }
  // expose for app.js compat
  window.piSessionView={
    getCachedSessionSnapshot, getCachedSessionMessages, cacheSessionMessages,
    markSessionCacheDirty, markActiveCacheDirty, refreshSessionCache,
    setSessionLoading, clearSessionLoading, renderConversation,
    reloadConversationFromRuntime, openHistorySession,
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
