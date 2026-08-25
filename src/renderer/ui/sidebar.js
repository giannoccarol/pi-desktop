"use strict";
// Sidebar + tabs – extracted from app.js monolith. Loaded before app.js, globals shared.

// Explicit deps – no reliance on app.js bare globals (fragile across script order)
var el = window.piStore ? window.piStore.el : {};
var state = window.piStore ? window.piStore.state : {};
var api = window.piDesktop;
function t(k, v){ return window.i18n ? window.i18n.t(k, v) : String(k); }
function toast(m,k,ms){ return window.piUi ? window.piUi.toast(m,k,ms) : void 0; }
function icon(n){ return window.piUi ? window.piUi.icon(n) : `<i data-lucide="${n}"></i>`; }
function refreshIcons(){ return window.piUi ? window.piUi.refreshIcons() : void 0; }
function escapeHtml(s){ return window.piUtils ? window.piUtils.escapeHtml(s) : String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function basename(p){ return window.piUtils ? window.piUtils.basename(p) : String(p||"").split(/[\\/]/).pop()||""; }
function truncate(s,n){ return window.piUtils ? window.piUtils.truncate(s,n) : (s&&String(s).length>n? String(s).slice(0,n-1)+"…":String(s)); }
function preferenceLabel(p){ return window.piUtils ? window.piUtils.preferenceLabel(p) : (p?[p.provider,p.modelId,p.thinkingLevel].filter(Boolean).join(" · "):""); }
function relTime(ms){ return window.piUtils ? window.piUtils.relTime(ms, Date.now(), (kk,vv)=>t(kk,vv)) : String(ms); }
function tabDisplayTitle(tab){ return window.piNavigation ? window.piNavigation.tabDisplayTitle(tab, state.sessions) : (tab.title || t("session.newChat")); }
function tabSubtitle(tab){ return window.piNavigation ? window.piNavigation.tabSubtitle(tab, state.sessions) : basename(tab.cwd || ""); }
function tabTooltip(tab,title){ return window.piNavigation ? window.piNavigation.tabTooltip(tab,title,state.sessions) : title; }
function configuredProjects(){ return window.piNavigation ? window.piNavigation.configuredProjects(state.settings) : [...new Set((Array.isArray(state.settings?.projects)?state.settings.projects:[state.settings?.cwd]).filter(Boolean))]; }
function sessionsForProject(path){ return window.piNavigation ? window.piNavigation.sessionsForProject({sessions:state.sessions, tabs:state.tabs, stableOrder:state.sessionOrder}, path) : state.sessions.filter(s=>s.cwd===path); }
function addUserMessage(){ return window.piMedia ? window.piMedia.addUserMessage.apply(null, arguments) : null; }
function renderAttachmentTray(){ return window.piComposer ? window.piComposer.renderAttachmentTray.apply(null, arguments) : void 0; }
function renderQueuePanel(){ return window.piComposer ? window.piComposer.renderQueuePanel.apply(null, arguments) : void 0; }
function autosize(){ return window.piComposer ? window.piComposer.autosize.apply(null, arguments) : void 0; }
function getCachedSessionMessages(f, tabId=null){ return window.piSessionView ? window.piSessionView.getCachedSessionMessages(f, tabId) : null; }
function setSessionLoading(f,o){ return window.piSessionView ? window.piSessionView.setSessionLoading(f,o) : void 0; }
function clearSessionLoading(){ return window.piSessionView ? window.piSessionView.clearSessionLoading() : void 0; }
function renderConversation(m,c){ return window.piSessionView ? window.piSessionView.renderConversation(m,c) : Promise.resolve(false); }
function reloadConversationFromRuntime(o){ return window.piSessionView ? window.piSessionView.reloadConversationFromRuntime(o) : Promise.resolve(false); }
function openHistorySession(s){ return window.piSessionView ? window.piSessionView.openHistorySession(s) : Promise.resolve(); }
function newChat(p){ return window.piSession ? window.piSession.newChat(p) : Promise.resolve(); }
function setConversationMode(a,b){ return window.piUi ? window.piUi.setConversationMode(a,b) : void 0; }
function resetQueueState(){ return window.piComposer ? window.piComposer.resetQueueState.apply(null, arguments) : void 0; }
var sessionsTimer = null;
var tabsTimer = null;

function stashActiveTabContext() {
  if (!state.activeTabId) return;
  const existing = state.tabContexts.get(state.activeTabId);
  state.tabContexts.set(state.activeTabId, {
    input: el.input.value,
    attachments: state.attachments.slice(),
    queueBehavior: state.queueBehavior,
    localQueue: state.localQueue.map((item) => ({
      id: item.id,
      message: item.message,
      displayText: item.displayText,
      messageSuffix: item.messageSuffix,
      images: item.images || [],
      userMessage: null,
    })),
    scrollState: window.piUi?.captureChatScrollState?.() || existing?.scrollState || null,
  });
}

function restoreActiveTabContext() {
  const saved = state.tabContexts.get(state.activeTabId);
  state.attachments = saved?.attachments?.slice() || [];
  state.queueBehavior = saved?.queueBehavior || "followUp";
  el.input.value = saved?.input || "";
  state.localQueue = (saved?.localQueue || []).map((item) => ({ ...item, userMessage: null }));
  for (const item of state.localQueue) {
    item.userMessage = addUserMessage(item.displayText, [], { timestamp: Date.now(), status: "localQueued" });
  }
  for (const button of el.queueBehaviorButtons) {
    button.classList.toggle("active", button.dataset.queueBehavior === state.queueBehavior);
  }
  renderAttachmentTray();
  renderQueuePanel();
  autosize();
  return saved;
}

function restoreActiveTabScroll({ fallbackToBottom = true } = {}) {
  const saved = state.tabContexts.get(state.activeTabId);
  window.piUi?.restoreChatScrollState?.(saved?.scrollState || null, { fallbackToBottom });
}

async function refreshTabs() {
  try {
    state.tabs = await api.listTabs();
    const active = state.tabs.find((tab) => tab.active);
    if (active) state.activeTabId = active.id;
    renderTabs();
    renderProjects();
    return state.tabs;
  } catch (err) {
    console.error(err);
    return state.tabs;
  }
}

function createTabButton() {
  const button = document.createElement("div");
  button.setAttribute("role", "tab");
  button.innerHTML = `<span class="chat-tab-status"></span>` +
    `<span class="chat-tab-text"><span class="chat-tab-title"></span><span class="chat-tab-subtitle"></span></span>` +
    `<button type="button" class="chat-tab-close" title="Chiudi tab" aria-label="Chiudi tab">${icon("x")}</button>`;
  button.addEventListener("click", (event) => {
    if (!event.target.closest(".chat-tab-close")) switchToTab(button.dataset.tabId);
  });
  button.addEventListener("auxclick", (event) => {
    if (event.button === 1) {
      event.preventDefault();
      closeChatTab(button.dataset.tabId);
    }
  });
  button.addEventListener("mousedown", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      switchToTab(button.dataset.tabId);
    }
  });
  button.querySelector(".chat-tab-close").addEventListener("click", (event) => {
    event.stopPropagation();
    closeChatTab(button.dataset.tabId);
  });
  return button;
}

function renderTabs() {
  const previousScrollLeft = el.chatTabs.scrollLeft;
  const focusedTabId = document.activeElement?.closest?.(".chat-tab")?.dataset.tabId || null;
  const existing = new Map([...el.chatTabs.querySelectorAll(":scope > .chat-tab")].map((node) => [node.dataset.tabId, node]));
  for (const [index, tab] of state.tabs.entries()) {
    const isLoading = tab.id === state.pendingTabId;
    const active = tab.id === state.activeTabId;
    const button = existing.get(tab.id) || createTabButton();
    existing.delete(tab.id);
    button.dataset.tabId = tab.id;
    button.className = `chat-tab${active ? " active" : ""}${tab.busy ? " busy" : ""}${isLoading ? " loading" : ""}`;
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
    const title = tabDisplayTitle(tab);
    const subtitle = isLoading ? t("session.loading") : tabSubtitle(tab);
    button.querySelector(".chat-tab-title").textContent = title;
    const subtitleEl = button.querySelector(".chat-tab-subtitle");
    subtitleEl.textContent = subtitle;
    subtitleEl.classList.toggle("hidden", !subtitle);
    button.title = `${tabTooltip(tab, title)}${isLoading ? "\n" + t("session.loading") : ""}`;
    const currentAtIndex = el.chatTabs.children[index];
    if (currentAtIndex !== button) el.chatTabs.insertBefore(button, currentAtIndex || null);
  }
  for (const node of existing.values()) node.remove();
  el.chatTabs.scrollLeft = previousScrollLeft;
  if (focusedTabId) {
    const focused = [...el.chatTabs.children].find((node) => node.dataset.tabId === focusedTabId);
    focused?.focus?.({ preventScroll: true });
  }
  refreshIcons();
}

async function switchToTab(tabId) {
  if (!tabId || tabId === state.activeTabId || state.creatingChat) return;
  const target = state.tabs.find((tab) => tab.id === tabId);
  if (!target) return;
  const generation = ++state.switchGeneration;
  stashActiveTabContext();
  state.pendingTabId = tabId;
  renderTabs();
  try {
    const cached = getCachedSessionMessages(target.sessionFile, target.id);
    setSessionLoading(target.sessionFile || `tab:${tabId}`, { showSkeleton: !cached });
    resetQueueState();
    state.attachments = [];
    const activate = Promise.all([
      api.activateTab(tabId),
      target.cwd ? api.activateProject(target.cwd) : Promise.resolve(null),
    ]);
    let painted = null;
    if (cached) {
      el.messages.innerHTML = "";
      state.streamAssistant = null;
      state.tools.clear();
      el.emptyState.classList.add("hidden");
      setConversationMode(true, false);
      await renderConversation(cached, () => generation === state.switchGeneration);
      if (generation !== state.switchGeneration) return;
      painted = cached;
    }
    const [, settings] = await activate;
    if (generation !== state.switchGeneration) return;
    if (settings) state.settings = settings;
    state.activeTabId = tabId;
    state.activeSessionFile = target.sessionFile || null;
    state.commands = [];
    el.statusCwd.textContent = target.cwd || state.settings?.cwd || "";
    await reloadConversationFromRuntime({ restoreTab: true, paintedCache: painted, switchGeneration: generation });
    if (generation === state.switchGeneration) {
      const saved = state.tabContexts.get(tabId);
      if (!saved?.scrollState || saved.scrollState.stickToBottom !== false) {
        await window.piUi?.waitUntilPinnedToBottom?.();
      }
    }
  } catch (err) {
    toast(`Cambio tab fallito: ${err.message}`, "error");
  } finally {
    if (generation === state.switchGeneration) {
      if (state.pendingTabId === tabId) state.pendingTabId = null;
      clearSessionLoading();
      await refreshTabs();
    }
  }
}

async function closeChatTab(tabId) {
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) return;
  if (tab.busy && !confirm("Questa chat sta ancora lavorando. Interromperla e chiudere il tab?")) return;
  const wasActive = tabId === state.activeTabId;
  if (wasActive) stashActiveTabContext();
  state.pendingTabId = tabId;
  renderTabs();
  try {
    const result = await api.closeTab(tabId);
    state.tabContexts.delete(tabId);
    if (!result.activeId) {
      state.activeTabId = null;
      await newChat(tab.cwd || state.settings?.cwd);
      return;
    }
    await refreshTabs();
    if (wasActive) {
      state.activeTabId = null;
      await switchToTab(result.activeId);
    }
  } catch (err) {
    toast(`Chiusura tab fallita: ${err.message}`, "error");
  } finally {
    if (state.pendingTabId === tabId) {
      state.pendingTabId = null;
      renderTabs();
    }
  }
}

async function refreshSessions() {
  try {
    state.sessions = await api.listSessions();
    const liveFiles = new Set(state.sessions.map((session) => session.file));
    for (const key of state.sessionOrder.keys()) if (!liveFiles.has(key)) state.sessionOrder.delete(key);
    for (const session of state.sessions) {
      if (!state.sessionOrder.has(session.file)) state.sessionOrder.set(session.file, session.modified || Date.now());
    }
    renderProjects();
  } catch (err) {
    console.error(err);
  }
}

function renderProjects() {
  const q = (el.sessionSearch.value || "").toLowerCase().trim();
  const previousScrollTop = el.projectsList.scrollTop;
  el.projectsList.innerHTML = "";
  const projects = configuredProjects().map((projectPath) => {
    const sessions = sessionsForProject(projectPath);
    const matchesProject = `${basename(projectPath)} ${projectPath}`.toLowerCase().includes(q);
    const matchingSessions = sessions.filter((session) =>
      `${session.name || ""} ${session.preview || ""}`.toLowerCase().includes(q)
    );
    return { path: projectPath, sessions, matchesProject, matchingSessions };
  }).filter((project) => !q || project.matchesProject || project.matchingSessions.length);

  for (const project of projects) {
    const active = project.path === state.settings?.cwd;
    const expanded = Boolean(q) || state.expandedProjects.has(project.path);
    const block = document.createElement("section");
    block.className = `project-block${active ? " active" : ""}${expanded ? " expanded" : ""}`;
    block.dataset.path = project.path;

    const row = document.createElement("div");
    row.className = "project-row";
    row.title = project.path;
    row.innerHTML =
      `${icon("chevron-right")} ${icon("folder")}<span class="project-title"></span>` +
      `<span class="project-actions">` +
      `<button class="project-action project-new" title="${escapeHtml(t("project.newChat.title", {name: basename(project.path)}))}" aria-label="${escapeHtml(t("session.newChat"))}">${icon("plus")}</button>` +
      `<button class="project-action project-remove" title="${escapeHtml(t("project.remove.title"))}" aria-label="${escapeHtml(t("project.menu.remove"))}">${icon("ellipsis")}</button>` +
      `</span>`;
    row.querySelector("svg, i")?.classList.add("project-chevron");
    row.querySelector(".project-title").textContent = basename(project.path) || project.path;
    if (state.creatingChat) row.style.pointerEvents = "none";
    row.addEventListener("click", (event) => {
      if (state.creatingChat) return;
      if (event.target.closest(".project-action")) return;
      if (event.target.closest(".project-menu")) return;
      if (state.expandedProjects.has(project.path)) state.expandedProjects.delete(project.path);
      else state.expandedProjects.add(project.path);
      renderProjects();
    });
    row.querySelector(".project-new").addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.creatingChat) return;
      newChat(project.path);
    });
    const menuBtn = row.querySelector(".project-remove");
    menuBtn.setAttribute("aria-expanded", state.openProjectMenu === project.path ? "true" : "false");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.creatingChat) return;
      state.openProjectMenu = state.openProjectMenu === project.path ? null : project.path;
      renderProjects();
    });
    // submenu
    const projectMenu = document.createElement("div");
    projectMenu.className = "project-menu" + (state.openProjectMenu === project.path ? "" : " hidden");
    projectMenu.setAttribute("role", "menu");
    projectMenu.innerHTML =
      `<button class="project-menu-item danger" role="menuitem" data-action="remove">${icon("trash-2")}<span>${escapeHtml(t("project.menu.remove"))}</span></button>` +
      `<button class="project-menu-item" role="menuitem" data-action="copy">${icon("copy")}<span>${escapeHtml(t("project.menu.copy"))}</span></button>`;
    projectMenu.querySelector('[data-action="remove"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      state.openProjectMenu = null;
      if (!confirm(t("confirm.removeProject", {name: basename(project.path)}))) {
        renderProjects();
        return;
      }
      try {
        const wasActive = project.path === state.settings?.cwd;
        state.settings = await api.removeProject(project.path);
        state.expandedProjects.delete(project.path);
        if (wasActive) await newChat(state.settings.cwd);
        else await refreshSessions();
      } catch (err) {
        toast(t("toast.removeProjectFail", {msg: err.message}), "error");
      }
    });
    projectMenu.querySelector('[data-action="copy"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      state.openProjectMenu = null;
      try {
        await navigator.clipboard.writeText(project.path);
        toast(t("toast.copyPath"));
      } catch {
        toast(project.path, "info");
      }
      renderProjects();
    });
    row.appendChild(projectMenu);
    block.appendChild(row);

    if (expanded) {
      const chats = document.createElement("div");
      chats.className = "project-chats";
      const candidates = q && !project.matchesProject ? project.matchingSessions : project.sessions;
      const limit = q ? candidates.length : (state.projectLimits.get(project.path) || 6);
      for (const session of candidates.slice(0, limit)) {
        const openTab = session.tabId
          ? state.tabs.find((tab) => tab.id === session.tabId)
          : state.tabs.find((tab) => tab.sessionFile === session.file);
        const isActive = session.tabId ? session.tabId === state.activeTabId : session.file === state.activeSessionFile;
        const isLoading = session.file === state.openingSessionFile;
        const item = document.createElement("div");
        item.className = "session-item" + (isActive ? " active" : "") + (isLoading ? " loading" : "") + (openTab?.busy || session.busy ? " running" : "");
        item.dataset.sessionFile = session.file || "";
        item.dataset.tabId = session.tabId || openTab?.id || "";
        const displayName = session.hasName ? session.name : truncate(session.preview || t("session.newChat"), 120);
        const prefLabel = preferenceLabel(session.preference);
        const timeLabel = isLoading ? t("session.loading") : relTime(session.modified);
        // custom tooltip data — no native title to avoid browser tooltip clash
        item.removeAttribute("title");
        item.dataset.tooltipTitle = displayName;
        item.dataset.tooltipPref = prefLabel || "";
        item.dataset.tooltipTime = timeLabel;
        item.dataset.tooltipPath = session.file || "";
        item.setAttribute("aria-busy", isLoading ? "true" : "false");
        item.innerHTML =
          `<div class="session-title"></div>` +
          `<div class="session-meta"><span>${isLoading ? t("session.loading") : relTime(session.modified)}</span>` +
          `<button class="sess-del" title="Elimina sessione" aria-label="Elimina sessione">${icon("trash-2")}</button></div>`;
        item.querySelector(".session-title").textContent = displayName;
        item.addEventListener("click", async (ev) => {
          if (ev.target.closest(".sess-del")) return;
          if (state.creatingChat) return;
          if (session.tabId) await switchToTab(session.tabId);
          else if (openTab) await switchToTab(openTab.id);
          else await openHistorySession(session);
        });
        const deleteButton = item.querySelector(".sess-del");
        if (session.draft) {
          deleteButton.title = "Chiudi bozza";
          deleteButton.setAttribute("aria-label", "Chiudi bozza");
        }
        deleteButton.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (state.creatingChat) return;
          if (session.draft) return closeChatTab(session.tabId);
          if (!confirm("Eliminare definitivamente questa sessione?")) return;
          try {
            await api.deleteSession(session.file);
            if (state.activeSessionFile === session.file) newChat(project.path);
            await refreshSessions();
          } catch (err) {
            toast(`Eliminazione fallita: ${err.message}`, "error");
          }
        });
        chats.appendChild(item);
      }
      if (!candidates.length) {
        const empty = document.createElement("div");
        empty.className = "project-empty";
        empty.textContent = q ? t("project.empty.noMatch") : t("project.empty.none");
        chats.appendChild(empty);
      } else if (!q) {
        const hasMore = candidates.length > limit;
        const canLess = limit > 6;
        if (hasMore || canLess) {
          const actions = document.createElement("div");
          actions.className = "project-more-wrap";
          if (hasMore) {
            const more = document.createElement("button");
            more.className = "project-more";
            const tr = window.i18n ? window.i18n.t : (k, v) => k;
            more.textContent = tr("project.showMore", { n: Math.min(6, candidates.length - limit) });
            // fallback if i18n missing placeholder
            if (more.textContent === "project.showMore") more.textContent = `Mostra altre ${Math.min(6, candidates.length - limit)}`;
            more.addEventListener("click", () => {
              state.projectLimits.set(project.path, limit + 6);
              renderProjects();
            });
            actions.appendChild(more);
          }
          if (canLess) {
            const less = document.createElement("button");
            less.className = "project-more project-less";
            const tr = window.i18n ? window.i18n.t : (k, v) => k;
            less.textContent = tr("project.showLess");
            if (less.textContent === "project.showLess") less.textContent = "Mostra meno";
            less.addEventListener("click", () => {
              state.projectLimits.set(project.path, 6);
              renderProjects();
            });
            actions.appendChild(less);
          }
          chats.appendChild(actions);
        }
      }
      block.appendChild(chats);
    }
    el.projectsList.appendChild(block);
  }

  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "menu-empty";
    empty.textContent = q ? t("project.empty.noProject") : t("project.empty.addFirst");
    el.projectsList.appendChild(empty);
  }
  const draftCount = state.tabs.filter((tab) => !tab.sessionFile).length;
  const visibleCount = state.sessions.length + draftCount;
  el.sessionsCount.textContent = visibleCount ? `${visibleCount} chat` : "";
  el.projectsList.scrollTop = previousScrollTop;
  refreshIcons();
}

function updateNavigationStatus(tabId) {
  if (!tabId) return;
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  for (const item of el.projectsList.querySelectorAll(".session-item")) {
    if (item.dataset.tabId === tabId || (tab?.sessionFile && item.dataset.sessionFile === tab.sessionFile)) {
      item.classList.toggle("running", Boolean(tab?.busy));
    }
  }
}

function initSidebarResize() {
  const key = "pi-desktop-sidebar-width";
  const minW = 210;
  const maxW = 520;
  const defaultW = 268;
  const sidebar = el.sidebar;
  const resizer = el.sidebarResizer;
  if (!sidebar || !resizer) return;
  let saved = null;
  try { saved = parseInt(localStorage.getItem(key), 10); } catch {}
  if (Number.isFinite(saved) && saved >= minW && saved <= maxW) {
    sidebar.style.setProperty("--sidebar-w", `${saved}px`);
  }
  let dragging = false;
  let startX = 0;
  let startW = 0;
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let w = Math.round(startW + dx);
    w = Math.max(minW, Math.min(maxW, w));
    sidebar.style.setProperty("--sidebar-w", `${w}px`);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    sidebar.classList.remove("resizing");
    document.body.classList.remove("is-resizing");
    const cur = parseInt(getComputedStyle(sidebar).getPropertyValue("--sidebar-w"), 10) || sidebar.getBoundingClientRect().width;
    try { localStorage.setItem(key, String(cur)); } catch {}
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  resizer.addEventListener("mousedown", (e) => {
    if (sidebar.classList.contains("collapsed")) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    resizer.classList.add("dragging");
    sidebar.classList.add("resizing");
    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  resizer.addEventListener("dblclick", (e) => {
    e.preventDefault();
    sidebar.style.setProperty("--sidebar-w", `${defaultW}px`);
    try { localStorage.setItem(key, String(defaultW)); } catch {}
  });
}

function initChatTooltip() {
  const tooltip = el.chatTooltip;
  if (!tooltip) return;
  const titleEl = tooltip.querySelector(".chat-tooltip-title");
  const prefWrap = tooltip.querySelector(".chat-tooltip-pref");
  const prefText = tooltip.querySelector(".ct-pref-text");
  const dotEl = tooltip.querySelector(".chat-tooltip-dot");
  const timeEl = tooltip.querySelector(".chat-tooltip-time");
  const pathEl = tooltip.querySelector(".chat-tooltip-path");
  let hideTimer = null;
  let currentTarget = null;
  const show = (target, e) => {
    const t = target.dataset.tooltipTitle;
    if (!t) return;
    currentTarget = target;
    clearTimeout(hideTimer);
    titleEl.textContent = t;
    const pref = target.dataset.tooltipPref || "";
    if (pref) { prefText.textContent = pref; prefWrap.style.display = "inline-flex"; dotEl.style.display = pref ? "" : "none"; }
    else { prefText.textContent = ""; prefWrap.style.display = "none"; }
    timeEl.textContent = target.dataset.tooltipTime || "";
    pathEl.textContent = target.dataset.tooltipPath || "";
    dotEl.style.display = pref ? "" : "none";
    if (!pref && !timeEl.textContent) dotEl.style.display = "none";
    tooltip.classList.remove("hidden");
    tooltip.setAttribute("aria-hidden", "false");
    refreshIcons();
    position(e);
  };
  const position = (e) => {
    if (tooltip.classList.contains("hidden")) return;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // default near cursor or target rect
    let x, y;
    if (e && typeof e.clientX === "number") { x = e.clientX + 18; y = e.clientY - 10; }
    else if (currentTarget) {
      const r = currentTarget.getBoundingClientRect();
      x = r.right + 12; y = r.top + 6;
    } else { x = pad; y = pad; }
    // measure
    tooltip.style.left = "0";
    tooltip.style.top = "0";
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width + pad > vw) x = vw - rect.width - pad;
    if (y + rect.height + pad > vh) y = vh - rect.height - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    tooltip.style.left = `${Math.round(x)}px`;
    tooltip.style.top = `${Math.round(y)}px`;
  };
  const hide = () => {
    hideTimer = setTimeout(() => {
      tooltip.classList.add("hidden");
      tooltip.setAttribute("aria-hidden", "true");
      currentTarget = null;
    }, 80);
  };
  const cancelHide = () => clearTimeout(hideTimer);
  // delegated listeners
  el.projectsList.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".session-item");
    if (!item) return;
    show(item, e);
  });
  el.projectsList.addEventListener("mousemove", (e) => {
    if (currentTarget) position(e);
  });
  el.projectsList.addEventListener("mouseout", (e) => {
    const item = e.target.closest(".session-item");
    if (!item) return;
    const related = e.relatedTarget;
    if (related && item.contains(related)) return;
    hide();
  });
  el.projectsList.addEventListener("focusin", (e) => {
    const item = e.target.closest(".session-item");
    if (item) show(item, null);
  });
  el.projectsList.addEventListener("focusout", hide);
  tooltip.addEventListener("mouseenter", cancelHide);
  tooltip.addEventListener("mouseleave", hide);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", () => { if (currentTarget) hide(); });
}

function initSearchEnhancement() {
  const input = el.sessionSearch;
  const wrap = el.globalSearch;
  const clearBtn = el.searchClear;
  if (!input || !wrap) return;
  const sync = () => {
    const has = Boolean(input.value.trim());
    wrap.classList.toggle("has-value", has);
    if (clearBtn) clearBtn.classList.toggle("hidden", !has);
  };
  input.addEventListener("input", sync);
  input.addEventListener("search", sync);
  if (clearBtn) clearBtn.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    sync();
    input.focus();
    renderProjects();
  });
  sync();
}

function refreshSessionsSoon() {
  clearTimeout(sessionsTimer);
  sessionsTimer = setTimeout(refreshSessions, 400);
}

function refreshTabsSoon() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(refreshTabs, 250);
}

// Expose unified API – both piSidebar namespace and legacy globals
if (typeof window !== "undefined") {
  window.piSidebar = Object.assign(window.piSidebar || {}, {
    stashActiveTabContext, restoreActiveTabContext, restoreActiveTabScroll,
    refreshTabs, renderTabs, switchToTab, closeChatTab, refreshSessions,
    renderProjects, updateNavigationStatus, initSidebarResize, initChatTooltip,
    initSearchEnhancement, refreshSessionsSoon, refreshTabsSoon
  });
  window.stashActiveTabContext = stashActiveTabContext;
  window.restoreActiveTabContext = restoreActiveTabContext;
  window.restoreActiveTabScroll = restoreActiveTabScroll;
  window.refreshTabs = refreshTabs;
  window.renderTabs = renderTabs;
  window.switchToTab = switchToTab;
  window.closeChatTab = closeChatTab;
  window.refreshSessions = refreshSessions;
  window.renderProjects = renderProjects;
  window.initSidebarResize = initSidebarResize;
  window.initChatTooltip = initChatTooltip;
  window.initSearchEnhancement = initSearchEnhancement;
  window.refreshSessionsSoon = refreshSessionsSoon;
  window.refreshTabsSoon = refreshTabsSoon;
}
if (typeof module !== "undefined" && module.exports) module.exports = window.piSidebar;
