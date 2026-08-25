"use strict";
// Session view: caching + loading + rendering conversation. Extracted from app.js
(function(){
  const el = window.piStore?.el;
  const state = window.piStore?.state;
  const api = window.piDesktop;
  const t = window.i18n ? window.i18n.t : (k)=>k;

  const sessionMessageCache = new Map();
  const SESSION_CACHE_MAX = 30;

  function getCachedSessionMessages(file){
    if(!file) return null;
    return sessionMessageCache.get(file)?.messages || null;
  }
  function cacheSessionMessages(file, messages){
    if(!file || !Array.isArray(messages)) return;
    sessionMessageCache.set(file,{messages, at: Date.now()});
    if(sessionMessageCache.size > SESSION_CACHE_MAX){
      let oldestKey=null, oldestAt=Infinity;
      for(const [k,v] of sessionMessageCache){ if(v.at<oldestAt){oldestAt=v.at; oldestKey=k;}}
      if(oldestKey && oldestKey!==file) sessionMessageCache.delete(oldestKey);
    }
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
    for(let i=0;i<displayMessages.length;i++){
      if(!isCurrent()) return false;
      window.piChat.renderFinalMessage(displayMessages[i],{results, consumed});
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
    const identical=Array.isArray(paintedCache) && paintedCache.length===displayMessages.length;
    if(!identical){
      if(window.piChat?.clearChat) window.piChat.clearChat(); else { el.messages.innerHTML=""; state.streamAssistant=null; state.tools.clear(); }
      const painted=await renderConversation(displayMessages,isCurrent);
      if(painted===false||!isCurrent()) return false;
    }
    cacheSessionMessages(state.activeSessionFile, displayMessages);
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
