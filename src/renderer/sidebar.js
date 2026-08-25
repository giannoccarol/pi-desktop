"use strict";
// Sidebar + tabs – extracted from app.js monolith. Loaded before app.js, globals shared.

function stashActiveTabContext() {
  if (!state.activeTabId) return;
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

function renderTabs() {
  el.chatTabs.innerHTML = "";
  for (const tab of state.tabs) {
    const isLoading = tab.id === state.pendingTabId;
    const button = document.createElement("div");
    button.className = `chat-tab${tab.id === state.activeTabId ? " active" : ""}${tab.busy ? " busy" : ""}${isLoading ? " loading" : ""}`;
    button.dataset.tabId = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", tab.id === state.activeTabId ? "true" : "false");
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
    button.tabIndex = tab.id === state.activeTabId ? 0 : -1;
    button.innerHTML = `<span class="chat-tab-status"></span><span class="chat-tab-title"></span>` +
      `<button type="button" class="chat-tab-close" title="Chiudi tab" aria-label="Chiudi tab">${icon("x")}</button>`;
    const title = tabDisplayTitle(tab);
    button.querySelector(".chat-tab-title").textContent = isLoading ? "caricamento…" : title;
    button.title = `${title}${tab.busy ? " · in esecuzione" : ""}${isLoading ? " · caricamento…" : ""}`;
    button.addEventListener("click", (event) => {
      if (event.target.closest(".chat-tab-close")) return;
      switchToTab(tab.id);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        switchToTab(tab.id);
      }
    });
    button.querySelector(".chat-tab-close").addEventListener("click", (event) => {
      event.stopPropagation();
      closeChatTab(tab.id);
    });
    el.chatTabs.appendChild(button);
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
    const cached = target.sessionFile ? getCachedSessionMessages(target.sessionFile) : null;
    setSessionLoading(target.sessionFile || `tab:${tabId}`, { showSkeleton: !cached });
    resetQueueState();
    state.attachments = [];
    await api.activateTab(tabId);
    if (generation !== state.switchGeneration) return;
    if (target.cwd) state.settings = await api.activateProject(target.cwd);
    if (generation !== state.switchGeneration) return;
    state.activeTabId = tabId;
    state.activeSessionFile = target.sessionFile || null;
    state.commands = [];
    el.statusCwd.textContent = target.cwd || state.settings?.cwd || "";
    let painted = null;
    if (cached) {
      el.messages.innerHTML = "";
      state.streamAssistant = null;
      state.tools.clear();
      el.emptyState.classList.add("hidden");
      setConversationMode(true, false);
      await renderConversation(cached, () => generation === state.switchGeneration);
      jumpToBottom();
      painted = cached;
    }
    await reloadConversationFromRuntime({ restoreTab: true, paintedCache: painted, switchGeneration: generation });
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
    renderProjects();
  } catch (err) {
    console.error(err);
  }
}

function renderProjects() {
  const q = (el.sessionSearch.value || "").toLowerCase().trim();
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
    const expanded = Boolean(q) || state.expandedProjects.has(project.path) || active;
    const block = document.createElement("section");
    block.className = `project-block${active ? " active" : ""}${expanded ? " expanded" : ""}`;
    block.dataset.path = project.path;

    const row = document.createElement("div");
    row.className = "project-row";
    row.title = project.path;
    row.innerHTML =
      `${icon("chevron-right")} ${icon("folder")}<span class="project-title"></span>` +
      `<span class="project-actions">` +
      `<button class="project-action project-new" title="Nuova chat in ${escapeHtml(basename(project.path))}" aria-label="${escapeHtml(t("session.newChat"))}">${icon("plus")}</button>` +
      `<button class="project-action project-remove" title="Rimuovi dalla sidebar" aria-label="Rimuovi progetto">${icon("ellipsis")}</button>` +
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
      `<button class="project-menu-item danger" role="menuitem" data-action="remove">${icon("trash-2")}<span>Rimuovi dalla sidebar</span></button>` +
      `<button class="project-menu-item" role="menuitem" data-action="copy">${icon("copy")}<span>Copia percorso</span></button>`;
    projectMenu.querySelector('[data-action="remove"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      state.openProjectMenu = null;
      if (!confirm(`Rimuovere “${basename(project.path)}” dalla sidebar? Le chat salvate non verranno eliminate.`)) {
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
        toast(`Impossibile rimuovere il progetto: ${err.message}`, "error");
      }
    });
    projectMenu.querySelector('[data-action="copy"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      state.openProjectMenu = null;
      try {
        await navigator.clipboard.writeText(project.path);
        toast("Percorso copiato.");
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
        const displayName = session.hasName ? session.name : truncate(session.preview || t("session.newChat"), 120);
        const prefLabel = preferenceLabel(session.preference);
        const timeLabel = isLoading ? "caricamento…" : relTime(session.modified);
        // custom tooltip data — no native title to avoid browser tooltip clash
        item.removeAttribute("title");
        item.dataset.tooltipTitle = displayName;
        item.dataset.tooltipPref = prefLabel || "";
        item.dataset.tooltipTime = timeLabel;
        item.dataset.tooltipPath = session.file || "";
        item.setAttribute("aria-busy", isLoading ? "true" : "false");
        item.innerHTML =
          `<div class="session-title"></div>` +
          `<div class="session-meta"><span>${isLoading ? "caricamento…" : relTime(session.modified)}</span>` +
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
        empty.textContent = q ? "Nessuna chat corrispondente" : "Nessuna chat";
        chats.appendChild(empty);
      } else if (!q && candidates.length > limit) {
        const more = document.createElement("button");
        more.className = "project-more";
        more.textContent = `Mostra altre ${Math.min(6, candidates.length - limit)}`;
        more.addEventListener("click", () => {
          state.projectLimits.set(project.path, limit + 6);
          renderProjects();
        });
        chats.appendChild(more);
      }
      block.appendChild(chats);
    }
    el.projectsList.appendChild(block);
  }

  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "menu-empty";
    empty.textContent = q ? "Nessun progetto o chat trovato." : "Aggiungi il tuo primo progetto.";
    el.projectsList.appendChild(empty);
  }
  const draftCount = state.tabs.filter((tab) => !tab.sessionFile).length;
  const visibleCount = state.sessions.length + draftCount;
  el.sessionsCount.textContent = visibleCount ? `${visibleCount} chat` : "";
  refreshIcons();
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

