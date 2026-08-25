"use strict";

// ---------------------------------------------------------------------------
// Pi Desktop renderer
// ---------------------------------------------------------------------------

const api = window.piDesktop;
const { hasVisibleAssistantContent, collapseRetryAttempts } = window.piChatUtils;
const $ = (sel) => document.querySelector(sel);
const i18n = window.i18n;
const t = i18n ? i18n.t : (k, v) => k;
const fmt = (k, v) => t(k, v);

// Store is the single source of truth – defined in store.js and loaded before app.js
const el = (typeof window !== "undefined" && window.piStore) ? window.piStore.el : {};
const state = (typeof window !== "undefined" && window.piStore) ? window.piStore.state : {
  settings: null,
  sessions: [],
  providers: [],
  attachments: [],
  packages: [],
  installedPackages: [],
  packageResources: [],
  packageBusy: null,
  packagePage: 1,
  packageTotal: 0,
  packagePageSize: 50,
  conversationActive: false,
  expandedProjects: new Set(),
  projectLimits: new Map(),
  openProjectMenu: null,
  activeSessionFile: null,
  activeTabId: null,
  tabs: [],
  tabContexts: new Map(),
  busy: false,
  activeUserMessage: null,
  lastAssistantErrored: false,
  lastAssistantErrorWrap: null,
  retryAttempt: 0,
  streamAssistant: null,
  tools: new Map(),
  modelsCache: null,
  modelsCacheAt: 0,
  currentModel: null,
  thinkingLevels: [],
  steerHintShown: false,
  commands: [],
  commandSelection: 0,
  slashSelection: 0,
  atSelection: 0,
  mentionResults: [],
  mentionQuery: null,
  commandsLoading: null,
  commandUsage: (() => { try { return JSON.parse(localStorage.getItem("pi-desktop-command-usage") || "{}"); } catch { return {}; } })(),
  autoRetryEnabled: true,
  directBashRunning: false,
  directBashCard: null,
  queueBehavior: "followUp",
  localQueue: [],
  nativeQueue: { steering: [], followUp: [] },
  queuedUserMessages: [],
  dispatchingLocalQueue: false,
  queueDispatchPaused: false,
  stopInProgress: false,
  extensionStatuses: new Map(),
  extensionWidgets: new Map(),
  authFlow: null,
  openingSessionFile: null,
  pendingTabId: null,
  switchGeneration: 0,
  creatingChat: false,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toast(message, kind = "info", ms = 4200) {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = message;
  el.toasts.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function refreshIcons() {
  try {
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
  } catch (err) {
    console.warn(t("icon.lucide.warn"), err);
  }
}

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function relTime(ms) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.relTime) return window.piUtils.relTime.apply(null, Array.from(arguments)); 
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return t("time.now");
  if (m < 60) return t("time.minutes", {n:m});
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hours", {n:h});
  const dd = Math.floor(h / 24);
  if (dd < 7) return t("time.days", {n:dd});
  return new Date(ms).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
 }

function fmtCost(c) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.fmtCost) return window.piUtils.fmtCost.apply(null, Array.from(arguments)); 
  if (!c && c !== 0) return "";
  if (c >= 1) return `$${c.toFixed(2)}`;
  return `$${c.toFixed(4)}`;
 }

function fmtTokens(n) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.fmtTokens) return window.piUtils.fmtTokens.apply(null, Array.from(arguments)); 
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
 }

function basename(p) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.basename) return window.piUtils.basename.apply(null, Array.from(arguments)); 
  if (!p) return "";
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
 }

function scrollBottom(force = false) {
  const near = el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight < 160;
  if (near || force) el.chat.scrollTop = el.chat.scrollHeight;
  if (near || force) queueMicrotask(updateScrollBottomVisibility);
}

function jumpToBottom() {
  const previous = el.chat.style.scrollBehavior;
  el.chat.style.scrollBehavior = "auto";
  el.chat.scrollTop = el.chat.scrollHeight;
  requestAnimationFrame(() => { el.chat.style.scrollBehavior = previous; });
  queueMicrotask(updateScrollBottomVisibility);
}

function isNearBottom(threshold = 140) {
  if (!el.chat) return true;
  return el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight < threshold;
}

function updateScrollBottomVisibility() {
  const btn = el.btnScrollBottom;
  if (!btn || !el.chat) return;
  const hasOverflow = el.chat.scrollHeight > el.chat.clientHeight + 12;
  const near = isNearBottom(140);
  const shouldHide = !hasOverflow || near || !state.conversationActive;
  btn.classList.toggle("hidden", shouldHide);
}

let scrollVisibilityRaf = 0;
function scheduleScrollVisibility() {
  if (scrollVisibilityRaf) return;
  scrollVisibilityRaf = requestAnimationFrame(() => {
    scrollVisibilityRaf = 0;
    updateScrollBottomVisibility();
  });
}

let renderQueued = false;
function scheduleScroll() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    scrollBottom();
    updateScrollBottomVisibility();
  });
}

function md(text) {
  return window.renderMarkdown(text);
}

function setConversationMode(active, animate = true) {
  if (state.conversationActive === active && el.modelDock.classList.contains("compact") === active) return;
  const before = el.modelDock.getBoundingClientRect();
  state.conversationActive = active;
  el.main.classList.toggle("has-chat", active);
  if (active) {
    el.modelDock.classList.add("compact");
    el.composerActions.insertBefore(el.modelDock, el.sendGroup);
  } else {
    el.modelDock.classList.remove("compact");
    el.composerWrap.after(el.modelDock);
  }
  queueMicrotask(updateScrollBottomVisibility);
  if (!animate || !before.width || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  requestAnimationFrame(() => {
    const after = el.modelDock.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const sx = Math.max(0.7, Math.min(1.3, before.width / Math.max(after.width, 1)));
    el.modelDock.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scaleX(${sx})`, opacity: 0.65 },
        { transform: "translate(0, 0) scaleX(1)", opacity: 1 },
      ],
      { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  });
}



function formatBytes(bytes) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.formatBytes) return window.piUtils.formatBytes.apply(null, Array.from(arguments)); 
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
 }



function clipboardImageExtension(mimeType) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.clipboardImageExtension) return window.piUtils.clipboardImageExtension.apply(null, Array.from(arguments)); 
  return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[mimeType] || "png";
 }

function bufferToBase64(buffer) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.bufferToBase64) return window.piUtils.bufferToBase64.apply(null, Array.from(arguments)); 
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
 }





// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function messageTime(value) {
  if (value == null) return { timestamp: null, label: t("time.notAvailable") };
  let timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { timestamp: null, label: t("time.notAvailable") };
  // Pi timestamps are normally milliseconds, but accept epoch seconds too.
  if (timestamp > 0 && timestamp < 1e12) timestamp *= 1000;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { timestamp: null, label: t("time.notAvailable") };
  return {
    timestamp,
    label: date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

const USER_STATUS = {
  sending: { rank: 0, label: t("status.sending") },
  localQueued: { rank: 1, label: "in coda nell’app · non ancora inviato" },
  received: { rank: 1, label: t("status.received") },
  queued: { rank: 1, label: t("status.queued") },
  processing: { rank: 2, label: t("status.processing") },
  retrying: { rank: 2, label: t("status.retrying") },
  done: { rank: 3, label: t("status.done") },
  historical: { rank: 3, label: t("status.historical") },
  failed: { rank: 4, label: t("status.failed") },
  interrupted: { rank: 4, label: t("status.interrupted") },
  error: { rank: 4, label: t("status.error") },
};

function setUserMessageStatus(wrap, status) {
  if (!wrap?.isConnected || !USER_STATUS[status]) return;
  const currentRank = Number(wrap.dataset.statusRank ?? -1);
  const next = USER_STATUS[status];
  // Async RPC acknowledgements can arrive after streaming already started.
  const reactivatingLocalQueue = wrap.dataset.status === "localQueued" && status === "sending";
  if (!reactivatingLocalQueue && status !== "error" && next.rank < currentRank) return;
  wrap.dataset.status = status;
  wrap.dataset.statusRank = String(next.rank);
  if (["received", "queued", "processing", "retrying", "done", "failed", "interrupted"].includes(status) && !wrap.dataset.receivedAt) {
    wrap.dataset.receivedAt = new Date().toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  const statusEl = wrap.querySelector(".message-status");
  if (statusEl) {
    const receivedAt = wrap.dataset.receivedAt;
    const timedLabels = {
      received: t("status.receivedAt", {time: receivedAt}),
      queued: t("status.queuedAt", {time: receivedAt}),
      processing: t("status.processingAt", {time: receivedAt}),
      retrying: t("status.retryingAt", {time: receivedAt}),
      done: t("status.doneAt", {time: receivedAt}),
      failed: t("status.failedAt", {time: receivedAt}),
      interrupted: t("status.interruptedAt", {time: receivedAt}),
    };
    statusEl.textContent = receivedAt ? timedLabels[status] || next.label : next.label;
  }
}

function addUserMessage(text, attachments = [], options = {}) {
  el.emptyState.classList.add("hidden");
  setConversationMode(true);
  const sentAt = messageTime(options.timestamp);
  const wrap = document.createElement("div");
  wrap.className = "msg-user";
  wrap.innerHTML =
    `<div class="role-tag">tu</div><div class="bubble"></div><div class="message-attachments"></div>` +
    `<div class="message-meta"><time></time><span class="message-status" aria-live="polite"></span></div>`;
  wrap.querySelector(".bubble").textContent = text;
  const time = wrap.querySelector("time");
  if (sentAt.timestamp != null) time.dateTime = new Date(sentAt.timestamp).toISOString();
  time.textContent = t("time.sentAt", {label: sentAt.label});
  const attachmentWrap = wrap.querySelector(".message-attachments");
  for (const attachment of attachments) {
    if (attachment.data && attachment.mimeType?.startsWith("image/")) {
      renderMediaBlock(attachmentWrap, attachment, attachment.name || "Immagine allegata");
    } else {
      const chip = document.createElement("span");
      chip.className = "message-attachment";
      chip.innerHTML = `${icon("file")}<span></span>`;
      chip.querySelector("span").textContent = attachment.name || t("attachment.fallback");
      attachmentWrap.appendChild(chip);
    }
  }
  if (!attachments.length) attachmentWrap.remove();
  el.messages.appendChild(wrap);
  setUserMessageStatus(wrap, options.status || "historical");
  refreshIcons();
  scheduleScroll();
  return wrap;
}

function makeToolCard(toolName, argsPreview, parent = el.messages) {
  const card = document.createElement("details");
  card.className = "tool-card";
  card.dataset.tool = String(toolName || "tool").toLowerCase();
  card.innerHTML =
    `<summary><span class="tool-name">${icon(toolIconName(toolName))} ${escapeHtml(toolDisplayName(toolName))}</span>` +
    `<span class="tool-args">${escapeHtml(argsPreview || "")}</span>` +
    `<span class="tool-state">in esecuzione…</span></summary>` +
    `<div class="tool-body"><pre></pre></div>`;
  parent.appendChild(card);
  refreshIcons();
  scheduleScroll();
  return card;
}

function escapeHtml(s) {
  if (typeof window !== "undefined" && window.piUtils && window.piUtils.escapeHtml) return window.piUtils.escapeHtml(s);
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageSource(block) {
  const mimeType = String(block?.mimeType || block?.media_type || "").toLowerCase();
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(mimeType)) return null;
  const data = String(block?.data || block?.content || "");
  if (!data || data.length > 28_000_000) return null;
  if (data.startsWith("data:")) {
    return data.startsWith(`data:${mimeType};base64,`) ? data : null;
  }
  if (!/^[a-z0-9+/=\s]+$/i.test(data)) return null;
  return `data:${mimeType};base64,${data.replace(/\s/g, "")}`;
}

function renderMediaBlock(parent, block, caption = "Immagine") {
  const source = safeImageSource(block);
  if (!source) return null;
  const figure = document.createElement("figure");
  figure.className = "chat-media";
  const img = document.createElement("img");
  img.src = source;
  img.alt = caption;
  img.loading = "lazy";
  img.addEventListener("click", () => figure.classList.toggle("expanded"));
  const label = document.createElement("figcaption");
  label.textContent = caption;
  figure.append(img, label);
  parent.appendChild(figure);
  return figure;
}

function renderBlockMedia(parent, content, prefix = "Immagine") {
  parent.querySelector(".tool-media")?.remove();
  const images = Array.isArray(content) ? content.filter((block) => block?.type === "image") : [];
  if (!images.length) return;
  const gallery = document.createElement("div");
  gallery.className = "tool-media media-gallery";
  images.forEach((block, index) => renderMediaBlock(gallery, block, `${prefix} ${index + 1}`));
  if (gallery.childElementCount) parent.appendChild(gallery);
}

function setToolCardResult(card, text, isError, content) {
  const st = card.querySelector(".tool-state");
  st.textContent = isError ? t("tool.error") : t("tool.ok");
  st.title = isError ? t("tool.error.title") : t("tool.ok.title");
  st.className = `tool-state ${isError ? "err" : t("tool.ok")}`;
  const pre = card.querySelector(".tool-body pre");
  pre.textContent = text || t("tool.noOutput");
  renderBlockMedia(card.querySelector(".tool-body"), content, "Output");
}

/** Render a finalized AgentMessage (assistant/user/toolResult/bash/custom). */


function isActivityOnly(blocks) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.isActivityOnly) return window.piUtils.isActivityOnly.apply(null, Array.from(arguments)); 
  const items = Array.isArray(blocks) ? blocks : [];
  const hasActivity = items.some((block) => block?.type === "toolCall" || block?.type === "thinking");
  const hasAnswer = items.some((block) =>
    block?.type === "image" || (block?.type === "text" && Boolean(block.text?.trim()))
  );
  return hasActivity && !hasAnswer;
 }

function toolIconName(toolName) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.toolIconName) return window.piUtils.toolIconName.apply(null, Array.from(arguments)); 
  const name = String(toolName || "").toLowerCase();
  if (name === "read") return "book-open";
  if (["edit", "write"].includes(name)) return "pencil";
  if (["grep", "find", "search"].includes(name)) return "search";
  if (["bash", "shell", "powershell"].some((value) => name.startsWith(value))) return "terminal";
  if (name === "ls") return "folder-open";
  return "wrench";
 }





function updateActivityBundle(bundle) {
  const count = bundle.querySelectorAll(".tool-card, details.think").length;
  bundle.querySelector(".activity-label").textContent = activityBundleLabel(bundle);
  bundle.querySelector(".activity-count").textContent = count ? `${count} attività` : "";
}



function textOfBlocks(content) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.textOfBlocks) return window.piUtils.textOfBlocks.apply(null, Array.from(arguments)); 
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
 }

/** Render assistant content blocks (text/thinking/toolCall) into a container. */


// ---------------------------------------------------------------------------
// Streaming assembly
// ---------------------------------------------------------------------------















// ---------------------------------------------------------------------------
// Session history sidebar
// ---------------------------------------------------------------------------

function tabDisplayTitle(tab) { if(typeof window!=="undefined" && window.piNavigation && window.piNavigation.tabDisplayTitle) return window.piNavigation.tabDisplayTitle(tab, state.sessions);
  const session = tab.sessionFile && state.sessions.find((candidate) => candidate.file === tab.sessionFile);
  if (session) return session.hasName ? session.name : truncate(session.preview || t("session.newChat"), 70);
  return tab.title || t("session.newChat");
}















function configuredProjects() { if(typeof window!=="undefined" && window.piNavigation && window.piNavigation.configuredProjects) return window.piNavigation.configuredProjects(state.settings);
  const values = Array.isArray(state.settings?.projects) ? state.settings.projects : [state.settings?.cwd];
  return [...new Set(values.filter(Boolean))];
}

function sessionsForProject(projectPath) { if(typeof window!=="undefined" && window.piNavigation && window.piNavigation.sessionsForProject) return window.piNavigation.sessionsForProject({sessions: state.sessions, tabs: state.tabs}, projectPath);
  const saved = state.sessions.filter((session) => session.cwd === projectPath);
  const drafts = state.tabs
    .filter((tab) => tab.cwd === projectPath && !tab.sessionFile)
    .map((tab) => ({
      file: `tab:${tab.id}`,
      tabId: tab.id,
      draft: true,
      cwd: tab.cwd,
      name: tab.title || t("session.newChat"),
      hasName: true,
      preview: tab.title || "",
      modified: tab.createdAt,
      busy: tab.busy,
      preference: null,
    }));
  return [...drafts, ...saved];
}



// ---------------------------------------------------------------------------
// Sidebar resize + custom tooltip + search enhancement
// ---------------------------------------------------------------------------







function truncate(s, n) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.truncate) return window.piUtils.truncate.apply(null, Array.from(arguments)); 
  return s && s.length > n ? s.slice(0, n - 1) + "…" : s;
 }

function preferenceLabel(preference) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.preferenceLabel) return window.piUtils.preferenceLabel.apply(null, Array.from(arguments)); 
  if (!preference) return "";
  return [preference.provider, preference.modelId, preference.thinkingLevel].filter(Boolean).join(" · ");
 }

function clearChat() {
  el.messages.innerHTML = "";
  state.streamAssistant = null;
  state.activeUserMessage = null;
  state.lastAssistantErrored = false;
  state.lastAssistantErrorWrap = null;
  state.retryAttempt = 0;
  state.tools.clear();
  queueMicrotask(updateScrollBottomVisibility);
}

// Cache of already-loaded conversations keyed by session file, so re-opening
// a chat paints instantly while the fresh copy loads in the background.
const sessionMessageCache = new Map(); // file -> { messages, at }
const SESSION_CACHE_MAX = 30;

function getCachedSessionMessages(file) {
  if (!file) return null;
  return sessionMessageCache.get(file)?.messages || null;
}

function cacheSessionMessages(file, messages) {
  if (!file || !Array.isArray(messages)) return;
  sessionMessageCache.set(file, { messages, at: Date.now() });
  if (sessionMessageCache.size > SESSION_CACHE_MAX) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [key, value] of sessionMessageCache) {
      if (value.at < oldestAt) { oldestAt = value.at; oldestKey = key; }
    }
    if (oldestKey && oldestKey !== file) sessionMessageCache.delete(oldestKey);
  }
}

function setSessionLoading(file, { showSkeleton = true } = {}) {
  state.openingSessionFile = file;
  document.body.classList.add("session-loading");
  el.statusActivity.textContent = t("session.loadingChat");
  if (!showSkeleton) {
    // Cached content stays visible; only the dim overlay is skipped.
    return;
  }
  el.chat.classList.add("session-loading");
  // prepare skeleton
  el.messages.innerHTML = "";
  state.streamAssistant = null;
  state.tools.clear();
  el.emptyState.classList.add("hidden");
  setConversationMode(true, false);
  const skel = document.createElement("div");
  skel.className = "chat-loading";
  skel.innerHTML =
    `<div class="chat-loading-header"><span class="spin"></span><span>Caricamento conversazione…</span></div>` +
    `<div class="skeleton-block"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>` +
    `<div class="skeleton-block"><div class="skeleton-line long"></div><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>` +
    `<div class="skeleton-block"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>`;
  el.messages.appendChild(skel);
  renderProjects();
}

function clearSessionLoading() {
  state.openingSessionFile = null;
  document.body.classList.remove("session-loading");
  el.chat.classList.remove("session-loading");
  if (!state.busy) el.statusActivity.textContent = "";
  renderProjects();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Render finalized messages yielding to the event loop every chunk so long
 * conversations never freeze the UI while they paint.
 */
async function renderConversation(displayMessages, isCurrent = () => true) {
  const results = new Map();
  for (const message of displayMessages) {
    if (message.role === "toolResult" && message.toolCallId) results.set(message.toolCallId, message);
  }
  const consumed = new Set();
  const CHUNK = 20;
  for (let i = 0; i < displayMessages.length; i++) {
    if (!isCurrent()) return false;
    renderFinalMessage(displayMessages[i], { results, consumed });
    if ((i + 1) % CHUNK === 0 && i + 1 < displayMessages.length) {
      scheduleScroll();
      await nextFrame();
    }
  }
  return true;
}

async function reloadConversationFromRuntime({ restoreTab = false, paintedCache = null, switchGeneration = null } = {}) {
  const isCurrent = () => switchGeneration == null || switchGeneration === state.switchGeneration;
  const msgs = await api.getMessages();
  if (!isCurrent()) return false;
  const displayMessages = collapseRetryAttempts(msgs.messages || []);
  const current = await api.getState();
  if (!isCurrent()) return false;
  state.activeSessionFile = current.sessionFile || null;
  state.activeTabId = current.tabId || state.activeTabId;
  if (restoreTab) restoreActiveTabContext();

  // If the freshly fetched conversation matches what we painted from cache,
  // keep the DOM as-is instead of flashing a full re-render.
  const identical = Array.isArray(paintedCache)
    && paintedCache.length === displayMessages.length;
  if (!identical) {
    clearChat();
    const painted = await renderConversation(displayMessages, isCurrent);
    if (painted === false || !isCurrent()) return false;
  }
  cacheSessionMessages(state.activeSessionFile, displayMessages);

  const hasContent = Boolean(displayMessages.length || state.localQueue.length);
  setConversationMode(hasContent, false);
  el.emptyState.classList.toggle("hidden", hasContent);
  setBusy(Boolean(current.isStreaming), { dispatchQueue: false });
  if (current.isStreaming && !state.streamAssistant) beginStreamAssistant();
  if (restoreTab && !current.isStreaming && state.localQueue.length) queueMicrotask(dispatchNextLocalMessage);
  jumpToBottom();

  // Secondary data must not block the chat from appearing; run them in
  // parallel after the messages are already on screen.
  Promise.all([refreshHeaderFromState(), refreshStats(), refreshSessions(), refreshTabs()]).catch(() => {});
  return true;
}

async function openHistorySession(session) {
  if (state.creatingChat) return;
  if (session.file === state.activeSessionFile && el.messages.querySelector(".chat-loading") == null && state.streamAssistant == null) {
    // evita rimbalzo se già aperta, ma consenti ricarico se necessario con doppio click intenzionale? Per ora blocca se già attiva
    // se l'utente clicca di nuovo sulla stessa chat già aperta non fare nulla
    // (rimuovi questo return se vuoi consentire il reload)
    // return;
  }
  const generation = ++state.switchGeneration;
  stashActiveTabContext();
  try {
    const cached = getCachedSessionMessages(session.file);
    setSessionLoading(session.file, { showSkeleton: !cached });
    resetQueueState();
    setBusy(false);
    state.settings = await api.activateProject(session.cwd);
    if (generation !== state.switchGeneration) return;
    state.expandedProjects.add(session.cwd);
    // Paint the cached copy immediately so the chat appears instantly; the
    // authoritative reload below reconciles it in the background.
    let painted = null;
    if (cached) {
      el.messages.innerHTML = "";
      state.streamAssistant = null;
      state.tools.clear();
      el.emptyState.classList.add("hidden");
      setConversationMode(true, false);
      await renderConversation(cached, () => generation === state.switchGeneration);
      if (generation !== state.switchGeneration) return;
      jumpToBottom();
      painted = cached;
    }
    const opened = await api.openSession(session.file, session.cwd, session.preference, session.name || session.preview);
    if (generation !== state.switchGeneration) return;
    state.commands = [];
    state.activeTabId = opened.tabId || state.activeTabId;
    state.activeSessionFile = session.file;
    el.statusCwd.textContent = session.cwd || "";
    await reloadConversationFromRuntime({ restoreTab: true, paintedCache: painted, switchGeneration: generation });
  } catch (err) {
    if (generation !== state.switchGeneration) return;
    // rimuovi skeleton e mostra errore
    clearChat();
    el.emptyState.classList.remove("hidden");
    setConversationMode(false, false);
    toast(`Impossibile aprire la sessione: ${err.message}`, "error");
  } finally {
    if (generation === state.switchGeneration) clearSessionLoading();
  }
}

// ---------------------------------------------------------------------------
// Native commands palette
// ---------------------------------------------------------------------------











function commandUsageScore(name) { if(typeof window!=="undefined" && window.piPersistence && window.piPersistence.commandUsageScore) return window.piPersistence.commandUsageScore(state.commandUsage, name);
  const usage = state.commandUsage[name];
  if (!usage) return 0;
  const ageDays = Math.max(0, (Date.now() - (usage.lastUsed || 0)) / 86400000);
  return (usage.count || 0) * 100 + Math.max(0, 30 - ageDays);
}

function recordCommandUsage(name) { if(typeof window!=="undefined" && window.piPersistence && window.piPersistence.recordCommandUsage) return window.piPersistence.recordCommandUsage(state.commandUsage, name);
  if (!name) return;
  const previous = state.commandUsage[name] || { count: 0, lastUsed: 0 };
  state.commandUsage[name] = { count: previous.count + 1, lastUsed: Date.now() };
  try { localStorage.setItem("pi-desktop-command-usage", JSON.stringify(state.commandUsage)); } catch {}
}











// ---------------------------------------------------------------------------
// Session tree, fork and clone
// ---------------------------------------------------------------------------















// ---------------------------------------------------------------------------
// Session actions and runtime controls
// ---------------------------------------------------------------------------









// ---------------------------------------------------------------------------
// Models / thinking pickers
// ---------------------------------------------------------------------------

async function loadModels(force = false) {
  const now = Date.now();
  if (!force && state.modelsCache && now - state.modelsCacheAt < 60000) return state.modelsCache;
  const data = await api.getAvailableModels();
  state.modelsCache = data.models || [];
  state.modelsCacheAt = now;
  return state.modelsCache;
}

function renderModelMenu(filter) {
  const models = state.modelsCache || [];
  const f = (filter || "").toLowerCase().trim();
  el.modelList.innerHTML = "";
  if (!models.length) {
    el.modelList.innerHTML = `<div class="menu-empty">Nessun modello disponibile.<br/>
    <span class="small">Configura le API key (env o <code>~/.pi/agent</code>) e riapri.</span></div>`;
    return;
  }
  const currentProvider = state.currentModel?.provider;
  const list = models.filter((m) => {
    if (currentProvider && m.provider !== currentProvider) return false;
    return !f || `${m.provider}/${m.id} ${m.name || ""}`.toLowerCase().includes(f);
  });
  if (!list.length) {
    el.modelList.innerHTML = `<div class="menu-empty">Nessuna corrispondenza.</div>`;
    return;
  }
  const lbl = document.createElement("div");
  lbl.className = "menu-group-label";
  lbl.textContent = currentProvider || "Modelli";
  el.modelList.appendChild(lbl);
  for (const m of list) {
    const item = document.createElement("div");
    const selected = state.currentModel && state.currentModel.provider === m.provider && state.currentModel.id === m.id;
    item.className = "menu-item" + (selected ? " selected" : "");
    item.innerHTML = `<span class="mi-name">${escapeHtml(m.name || m.id)}</span>` +
      `<span class="mi-sub mono">${escapeHtml(m.id)}</span>`;
    item.addEventListener("click", async () => {
      try {
        await api.setModel(m.provider, m.id);
        state.currentModel = { provider: m.provider, id: m.id };
        updateModelLabel();
        renderModelMenu(el.modelSearch.value);
        closeMenus();
        toast(`Modello: ${m.provider}/${m.id}`);
      } catch (err) {
        toast(`Cambio modello fallito: ${err.message}`, "error");
      }
    });
    el.modelList.appendChild(item);
  }
}

function renderProviderMenu() {
  const providers = new Map();
  for (const model of state.modelsCache || []) {
    if (!providers.has(model.provider)) providers.set(model.provider, []);
    providers.get(model.provider).push(model);
  }
  el.providerList.innerHTML = "";
  if (!providers.size) {
    el.providerList.innerHTML = `<div class="menu-empty">Nessun provider configurato.</div>`;
    return;
  }
  for (const [provider, models] of providers) {
    const item = document.createElement("div");
    item.className = "menu-item" + (state.currentModel?.provider === provider ? " selected" : "");
    item.innerHTML = `<span class="mi-name">${escapeHtml(provider)}</span><span class="mi-sub">${models.length} modelli</span>`;
    item.addEventListener("click", async () => {
      if (state.currentModel?.provider === provider) {
        closeMenus();
        return;
      }
      const target = models[0];
      try {
        await api.setModel(target.provider, target.id);
        state.currentModel = { provider: target.provider, id: target.id };
        updateModelLabel();
        renderProviderMenu();
        closeMenus();
        toast(`Provider: ${provider} · ${target.name || target.id}`);
      } catch (err) {
        toast(`Cambio provider fallito: ${err.message}`, "error");
      }
    });
    el.providerList.appendChild(item);
  }
}

function updateModelLabel() {
  const m = state.currentModel;
  const details = m && (state.modelsCache || []).find((candidate) => candidate.provider === m.provider && candidate.id === m.id);
  el.providerLabel.textContent = m?.provider || "scegli provider";
  el.modelLabel.textContent = m ? (details?.name || m.id) : "scegli modello";
}

async function refreshHeaderFromState() {
  try {
    const st = await api.getState();
    state.currentModel = st.model ? { provider: st.model.provider, id: st.model.id } : null;
    await loadModels().catch(() => []);
    updateModelLabel();
    if (st.sessionFile) state.activeSessionFile = st.sessionFile;
    if (st.thinkingLevel) el.thinkingLabel.textContent = st.thinkingLevel;
    await refreshThinkingLevels();
  } catch {}
}

async function refreshThinkingLevels() {
  try {
    const data = await api.getThinkingLevels();
    const levels = (data && data.levels) || ["off"];
    state.thinkingLevels = levels;
    el.thinkingList.innerHTML = "";
    for (const lvl of levels) {
      const item = document.createElement("div");
      item.className = "menu-item" + (el.thinkingLabel.textContent === lvl ? " selected" : "");
      item.innerHTML = `<span class="mi-name">${lvl}</span>`;
      item.addEventListener("click", async () => {
        try {
          await api.setThinkingLevel(lvl);
          el.thinkingLabel.textContent = lvl;
          renderThinkingMenu();
          closeMenus();
        } catch (err) {
          toast(err.message, "error");
        }
      });
      el.thinkingList.appendChild(item);
    }
    el.thinkingDropdown.style.display = levels.length <= 1 ? "none" : "";
  } catch {}
}

function renderThinkingMenu() {
  for (const item of el.thinkingList.children) {
    item.classList.toggle("selected", item.textContent.trim() === el.thinkingLabel.textContent.trim());
  }
}

function closeMenus() {
  el.providerMenu.classList.add("hidden");
  el.modelMenu.classList.add("hidden");
  el.thinkingMenu.classList.add("hidden");
}

function setSidebarVisible(visible) {
  el.sidebar.classList.toggle("collapsed", !visible);
  api.setSettings({ sidebarVisible: visible }).catch(() => {});
}

function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("pi-desktop-theme", resolved);
  el.themeBtn.innerHTML = icon(resolved === "dark" ? "moon" : "sun");
  el.themeBtn.title = resolved === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro";
  refreshIcons();
}

async function loadProviderSettings() {
  try {
    state.providers = await api.listProviders();
    renderProviderSettings();
  } catch (err) {
    el.providerSettingsList.innerHTML = `<div class="menu-empty">Impossibile leggere i provider: ${escapeHtml(err.message)}</div>`;
  }
}

async function startProviderLogin(provider, authType) {
  state.authFlow = { providerId: provider.id, providerName: provider.name, authType, requestId: null };
  el.authTitle.textContent = `Accedi a ${provider.name}`;
  el.authSubtitle.textContent = authType === "oauth" ? "Accesso OAuth gestito nativamente da Pi." : "Configurazione credenziale gestita nativamente da Pi.";
  el.authStatus.innerHTML = `<span class="muted">Avvio procedura…</span>`;
  resetAuthPrompt();
  el.modalAuth.showModal();
  try {
    state.providers = await api.loginProvider(provider.id, authType);
    state.modelsCache = null;
    renderProviderSettings();
    toast(`${provider.name} configurato.`);
    el.modalAuth.close();
  } catch (err) {
    if (!/annullato/i.test(err.message)) toast(`Accesso fallito: ${err.message}`, "error", 8000);
  } finally {
    state.authFlow = null;
  }
}

function resetAuthPrompt() {
  el.authOptions.innerHTML = "";
  el.authOptions.classList.add("hidden");
  el.authInputWrap.classList.add("hidden");
  el.authOk.classList.add("hidden");
  el.authInput.value = "";
  el.authInput.type = "text";
}

function authEventText(event) {
  if (event.type === "auth_url") return `${event.instructions || "Completa l’accesso nel browser."}\n${event.url}`;
  if (event.type === "device_code") return `Apri ${event.verificationUri} e inserisci il codice:\n${event.userCode}`;
  return event.message || "Accesso in corso…";
}

function respondToAuthPrompt(value, cancelled = false) {
  const requestId = state.authFlow?.requestId;
  if (!requestId) return;
  state.authFlow.requestId = null;
  resetAuthPrompt();
  api.authRespond(requestId, value, cancelled).catch(() => {});
  if (!cancelled) el.authStatus.innerHTML = `<span class="muted">Verifica in corso…</span>`;
}

api.on("pi:auth-request", (message) => {
  if (!state.authFlow || message.providerId !== state.authFlow.providerId) return;
  if (message.kind === "event") {
    el.authStatus.textContent = authEventText(message.event || {});
    return;
  }
  if (message.kind === "error") {
    el.authStatus.innerHTML = `<span style="color:var(--red)">${escapeHtml(message.error || "Accesso fallito")}</span>`;
    return;
  }
  if (message.kind !== "prompt") return;
  resetAuthPrompt();
  state.authFlow.requestId = message.id;
  const prompt = message.prompt || {};
  el.authStatus.textContent = prompt.message || "Inserisci le informazioni richieste.";
  if (prompt.type === "select") {
    el.authOptions.classList.remove("hidden");
    for (const option of prompt.options || []) {
      const button = document.createElement("button");
      button.className = "btn ghost auth-option";
      button.innerHTML = `<strong>${escapeHtml(option.label)}</strong>${option.description ? `<span class="muted small">${escapeHtml(option.description)}</span>` : ""}`;
      button.addEventListener("click", () => respondToAuthPrompt(option.id));
      el.authOptions.appendChild(button);
    }
  } else {
    el.authInputWrap.classList.remove("hidden");
    el.authInputLabel.textContent = prompt.message || "Valore";
    el.authInput.placeholder = prompt.placeholder || "";
    el.authInput.type = prompt.type === "secret" ? "password" : "text";
    el.authOk.classList.remove("hidden");
    el.authOk.onclick = () => respondToAuthPrompt(el.authInput.value);
    setTimeout(() => el.authInput.focus(), 40);
  }
});

async function loadNativePiSettings() {
  el.settingsRuntime.classList.add("loading");
  try {
    const data = await api.getPiSettings();
    const settings = data.effective || {};
    el.projectTrust.value = data.trust?.exact === true ? "true" : data.trust?.exact === false ? "false" : "inherit";
    el.defaultTrust.value = settings.defaultProjectTrust || "ask";
    el.transport.value = settings.transport || "auto";
    el.enabledModels.value = (settings.enabledModels || []).join(", ");
    const tools = Array.isArray(settings.defaultTools) ? settings.defaultTools : ["read", "bash", "edit", "write"];
    for (const checkbox of el.nativeTools) checkbox.checked = tools.includes(checkbox.value);
    el.shellPath.value = settings.shellPath || "";
    el.shellPrefix.value = settings.shellCommandPrefix || "";
    el.compactEnabled.checked = settings.compaction?.enabled !== false;
    el.compactReserve.value = settings.compaction?.reserveTokens ?? 16384;
    el.compactKeep.value = settings.compaction?.keepRecentTokens ?? 20000;
    el.retryEnabled.checked = settings.retry?.enabled !== false;
    el.retryMax.value = settings.retry?.maxRetries ?? 3;
    el.retryDelay.value = settings.retry?.baseDelayMs ?? 2000;
    el.imageResize.checked = settings.images?.autoResize !== false;
    el.blockImages.checked = settings.images?.blockImages === true;
    const trust = data.trust || {};
    const effective = trust.effective === true ? "attendibile" : trust.effective === false ? "non attendibile" : "nessuna decisione salvata";
    const inherited = trust.inheritedPath && trust.inheritedPath !== state.settings.cwd ? `, ereditata da ${trust.inheritedPath}` : "";
    el.projectTrustNote.textContent = trust.hasResources
      ? `Il progetto contiene risorse Pi soggette a trust. Decisione effettiva: ${effective}${inherited}.`
      : `Il progetto non contiene attualmente risorse locali soggette a trust. Decisione effettiva: ${effective}${inherited}.`;
  } catch (err) {
    el.projectTrustNote.textContent = `Impossibile leggere le impostazioni Pi: ${err.message}`;
  } finally {
    el.settingsRuntime.classList.remove("loading");
  }
}

async function saveNativePiSettings() {
  const trustDecision = el.projectTrust.value === "true" ? true : el.projectTrust.value === "false" ? false : null;
  const patch = {
    defaultProjectTrust: el.defaultTrust.value,
    transport: el.transport.value,
    enabledModels: el.enabledModels.value.split(","),
    defaultTools: [...el.nativeTools].filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value),
    shellPath: el.shellPath.value,
    shellCommandPrefix: el.shellPrefix.value,
    compaction: {
      enabled: el.compactEnabled.checked,
      reserveTokens: el.compactReserve.value,
      keepRecentTokens: el.compactKeep.value,
    },
    retry: {
      enabled: el.retryEnabled.checked,
      maxRetries: el.retryMax.value,
      baseDelayMs: el.retryDelay.value,
    },
    images: {
      autoResize: el.imageResize.checked,
      blockImages: el.blockImages.checked,
    },
  };
  el.piSettingsSave.disabled = true;
  try {
    await api.savePiSettings(patch, trustDecision);
    state.autoRetryEnabled = el.retryEnabled.checked;
    state.modelsCache = null;
    state.commands = [];
    toast("Impostazioni native Pi salvate; runtime ricaricato.");
    await refreshHeaderFromState();
    await loadNativePiSettings();
  } catch (err) {
    toast(`Salvataggio impostazioni Pi fallito: ${err.message}`, "error", 8000);
  } finally {
    el.piSettingsSave.disabled = false;
  }
}

function switchSettingsTab(tab) {
  for (const button of el.settingsTabs) {
    button.classList.toggle("active", button.dataset.settingsTab === tab);
  }
  el.settingsGeneral.classList.toggle("hidden", tab !== "general");
  el.settingsRuntime.classList.toggle("hidden", tab !== "runtime");
  el.settingsProviders.classList.toggle("hidden", tab !== "providers");
  el.btnSettingsSave.classList.toggle("hidden", tab !== "general");
  if (tab === "providers") loadProviderSettings();
  if (tab === "runtime") loadNativePiSettings();
}

function renderProviderSettings() {
  const q = (el.providerSettingsSearch.value || "").toLowerCase().trim();
  const providers = state.providers.filter((provider) =>
    `${provider.name} ${provider.id} ${provider.envVar} ${provider.hint}`.toLowerCase().includes(q)
  );
  el.providerSettingsList.innerHTML = "";
  if (!providers.length) {
    el.providerSettingsList.innerHTML = `<div class="menu-empty">Nessun provider trovato.</div>`;
    return;
  }
  for (const provider of providers) {
    const card = document.createElement("article");
    card.className = "provider-card";
    card.dataset.provider = provider.id;
    const authTypes = provider.authTypes || [];
    const canUseApiKey = Boolean(provider.envVar) && !provider.oauthOnly;
    const connectionHelp = provider.credentialType === "oauth"
        ? "Salvando una key sostituirai l’accesso OAuth."
        : provider.credentialType === "environment"
          ? `La variabile ${escapeHtml(provider.envVar)} è disponibile nel processo. Puoi sovrascriverla con una chiave locale.`
          : "La configurazione guidata usa direttamente il sistema di autenticazione di Pi.";
    const nativeAuthControls = authTypes.length
      ? `<div class="native-auth-actions">` +
        `${authTypes.includes("oauth") ? `<button class="btn primary provider-native-login" data-auth-type="oauth">${escapeHtml(provider.oauthLabel || provider.oauthName || "Accedi con OAuth")}</button>` : ""}` +
        `${authTypes.includes("api_key") ? `<button class="btn ghost provider-native-login" data-auth-type="api_key">Configura ${escapeHtml(provider.apiKeyName || "API key")}</button>` : ""}` +
        `</div>`
      : "";
    const apiKeyControls = canUseApiKey
      ? `<label>${escapeHtml(provider.envVar)}</label>` +
        `<div class="provider-key-row"><input class="provider-key" type="password" maxlength="20000" autocomplete="off" placeholder="Incolla la API key" />` +
        `<button class="btn primary provider-save">Salva</button></div>`
      : "";
    card.innerHTML =
      `<div class="provider-card-head">` +
      `<span class="provider-avatar">${escapeHtml(provider.name.slice(0, 2).toUpperCase())}</span>` +
      `<span class="provider-card-copy"><strong>${escapeHtml(provider.name)}</strong>` +
      `<small class="${provider.configured ? "provider-status" : ""}">${provider.configured ? escapeHtml(provider.masked || "Configurato") : escapeHtml(provider.hint)}</small></span>` +
      `<button class="btn ghost provider-connect">${provider.configured ? "Gestisci" : "Connetti"}</button>` +
      `</div>` +
      `<div class="provider-config hidden">` +
      nativeAuthControls +
      apiKeyControls +
      `<div class="provider-card-actions"><span class="muted small">${connectionHelp}</span>` +
      `${provider.removable ? '<button class="btn ghost small provider-remove">Disconnetti</button>' : ""}</div>` +
      `</div>`;
    const config = card.querySelector(".provider-config");
    card.querySelector(".provider-connect").addEventListener("click", () => {
      config.classList.toggle("hidden");
      if (!config.classList.contains("hidden")) card.querySelector(".provider-key")?.focus();
    });
    card.querySelector(".provider-save")?.addEventListener("click", async () => {
      const keyInput = card.querySelector(".provider-key");
      try {
        state.providers = await api.setProviderKey(provider.id, keyInput.value);
        state.modelsCache = null;
        toast(`${provider.name} configurato. Runtime di pi aggiornato.`);
        renderProviderSettings();
      } catch (err) {
        toast(`Configurazione fallita: ${err.message}`, "error");
      } finally {
        keyInput.value = "";
      }
    });
    for (const loginButton of card.querySelectorAll(".provider-native-login")) {
      loginButton.addEventListener("click", () => startProviderLogin(provider, loginButton.dataset.authType));
    }
    card.querySelector(".provider-remove")?.addEventListener("click", async () => {
      if (!confirm(`Disconnettere ${provider.name}? La credenziale verrà rimossa da auth.json.`)) return;
      try {
        state.providers = await api.removeProvider(provider.id);
        state.modelsCache = null;
        toast(`${provider.name} disconnesso.`);
        renderProviderSettings();
      } catch (err) {
        toast(`Disconnessione fallita: ${err.message}`, "error");
      }
    });
    el.providerSettingsList.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Pi package store
// ---------------------------------------------------------------------------

function installedPackageNames() {
  const names = new Set();
  for (const entry of state.installedPackages) {
    if (!entry.source?.startsWith("npm:")) continue;
    let spec = entry.source.slice(4);
    const versionAt = spec.lastIndexOf("@");
    if (versionAt > spec.indexOf("/")) spec = spec.slice(0, versionAt);
    else if (!spec.startsWith("@") && versionAt > 0) spec = spec.slice(0, versionAt);
    names.add(spec);
  }
  return names;
}

function npmNameFromSource(source) {
  if (!source?.startsWith("npm:")) return null;
  let spec = source.slice(4);
  const versionAt = spec.lastIndexOf("@");
  if (versionAt > spec.indexOf("/")) spec = spec.slice(0, versionAt);
  else if (!spec.startsWith("@") && versionAt > 0) spec = spec.slice(0, versionAt);
  return spec;
}

function installedEntryForName(name) {
  return state.installedPackages.find((entry) => npmNameFromSource(entry.source) === name) || null;
}

function formatDownloads(value) {
  const count = Number(value) || 0;
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e7 ? 0 : 1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(count >= 1e5 ? 0 : 1)}K`;
  return count.toLocaleString("it-IT");
}

async function loadPackageStore({ resetPage = false } = {}) {
  if (resetPage) state.packagePage = 1;
  el.packageList.innerHTML = `<div class="menu-empty">Caricamento catalogo…</div>`;
  try {
    const [catalog, installed, resources] = await Promise.all([
      api.searchPackages({
        query: el.packageSearch.value.trim(),
        type: el.packageType.value,
        sort: el.packageSort.value,
        page: state.packagePage,
      }),
      api.listInstalledPackages().catch(() => []),
      api.listPackageResources().catch(() => []),
    ]);
    const result = Array.isArray(catalog) ? { items: catalog, total: catalog.length, page: state.packagePage, pageSize: 50 } : catalog;
    state.packages = result?.items || [];
    state.packageTotal = Number(result?.total) || state.packages.length;
    state.packagePage = Number(result?.page) || state.packagePage;
    state.packagePageSize = Number(result?.pageSize) || 50;
    state.installedPackages = installed;
    state.packageResources = resources;
    renderPackageStore();
  } catch (err) {
    el.packageList.innerHTML = `<div class="menu-empty">Catalogo non disponibile.<br><span class="small">${escapeHtml(err.message)}</span></div>`;
  }
}

function renderPackageStore() {
  const installed = installedPackageNames();
  renderNativePackageSections();
  el.packageList.innerHTML = "";
  const pageCount = Math.max(1, Math.ceil(state.packageTotal / state.packagePageSize));
  el.packagePageInfo.textContent = `Pagina ${state.packagePage} di ${pageCount} · ${state.packageTotal.toLocaleString("it-IT")} pacchetti`;
  const catalogUrl = new URL("https://pi.dev/packages");
  if (el.packageSearch.value.trim()) catalogUrl.searchParams.set("name", el.packageSearch.value.trim());
  if (el.packageType.value) catalogUrl.searchParams.set("type", el.packageType.value);
  if (el.packageSort.value !== "downloads") catalogUrl.searchParams.set("sort", el.packageSort.value);
  if (state.packagePage > 1) catalogUrl.searchParams.set("page", String(state.packagePage));
  el.packageCatalogLink.href = catalogUrl.toString();
  el.packagePrev.disabled = state.packagePage <= 1 || Boolean(state.packageBusy);
  el.packageNext.disabled = state.packagePage >= pageCount || Boolean(state.packageBusy);
  if (!state.packages.length) {
    el.packageList.innerHTML = `<div class="menu-empty">Nessun pacchetto trovato.</div>`;
    return;
  }
  for (const pkg of state.packages) {
    const isInstalled = installed.has(pkg.name);
    const card = document.createElement("article");
    card.className = `package-card${isInstalled ? " installed" : ""}`;
    const tags = (pkg.types || []).map((type) => `<span class="package-type">${escapeHtml(type)}</span>`).join("") + (pkg.keywords || [])
      .filter((keyword) => keyword !== "pi-package" && keyword !== "pi")
      .slice(0, 3)
      .map((keyword) => `<span>${escapeHtml(keyword)}</span>`)
      .join("");
    card.innerHTML =
      `<div class="package-card-icon">${icon(isInstalled ? "badge-check" : "package")}</div>` +
      `<div class="package-card-content"><div class="package-card-title"><strong>${escapeHtml(pkg.name)}</strong>${pkg.version ? `<span>v${escapeHtml(pkg.version)}</span>` : ""}<span class="package-card-downloads">${icon("download")} ${formatDownloads(pkg.monthlyDownloads || pkg.downloads)} / mese</span></div>` +
      `<p>${escapeHtml(pkg.description)}</p><div class="package-card-meta">${tags}` +
      `${pkg.publisher ? `<span>di ${escapeHtml(pkg.publisher)}</span>` : ""}</div></div>` +
      `<div class="package-card-actions"><a class="icon-btn borderless tiny" href="${escapeHtml(pkg.npmUrl)}" title="Apri su npm" aria-label="Apri su npm">${icon("external-link")}</a>` +
      `<button class="btn ${isInstalled ? "ghost package-uninstall" : "primary package-install"}" ${state.packageBusy ? "disabled" : ""}>` +
      `${state.packageBusy === pkg.name ? "Attendi…" : isInstalled ? "Rimuovi" : "Installa"}</button></div>`;
    card.querySelector(".package-install")?.addEventListener("click", () => changePackage(pkg, "install"));
    card.querySelector(".package-uninstall")?.addEventListener("click", () => changePackage(pkg, "remove"));
    el.packageList.appendChild(card);
  }
  refreshIcons();
}

function renderNativePackageSections() {
  el.packageInstalledCount.textContent = `(${state.installedPackages.length})`;
  el.packageInstalledList.innerHTML = "";
  if (!state.installedPackages.length) {
    el.packageInstalledList.innerHTML = `<div class="menu-empty">Nessun pacchetto configurato.</div>`;
  }
  for (const entry of state.installedPackages) {
    const row = document.createElement("div");
    row.className = "package-native-item";
    const code = document.createElement("code");
    code.className = "grow";
    code.textContent = entry.source;
    code.title = entry.source;
    const badge = document.createElement("span");
    badge.className = "package-type";
    badge.textContent = entry.scope === "project" ? "progetto" : "utente";
    const update = document.createElement("button");
    update.className = "btn ghost small";
    update.textContent = "Aggiorna";
    update.disabled = Boolean(state.packageBusy);
    update.addEventListener("click", () => updatePackageTarget(entry.source));
    const remove = document.createElement("button");
    remove.className = "btn ghost small";
    remove.textContent = "Rimuovi";
    remove.disabled = Boolean(state.packageBusy);
    remove.addEventListener("click", () => removeInstalledSource(entry));
    row.append(code, badge, update, remove);
    el.packageInstalledList.appendChild(row);
  }

  el.packageResourceCount.textContent = `(${state.packageResources.length})`;
  el.packageResourceList.innerHTML = "";
  if (!state.packageResources.length) {
    el.packageResourceList.innerHTML = `<div class="menu-empty">Nessuna risorsa rilevata.</div>`;
  }
  for (const resource of state.packageResources) {
    const row = document.createElement("label");
    row.className = "package-resource-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = resource.enabled;
    checkbox.disabled = Boolean(state.packageBusy);
    const copy = document.createElement("span");
    copy.className = "grow";
    const title = document.createElement("strong");
    title.textContent = resource.name;
    const meta = document.createElement("small");
    meta.className = "muted";
    meta.textContent = `${resource.type} · ${resource.metadata?.source || "auto"} · ${resource.metadata?.scope || "user"}`;
    meta.title = resource.path;
    copy.append(title, meta);
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      try {
        await api.setPackageResourceEnabled(resource, checkbox.checked);
        state.packageResources = await api.listPackageResources();
        state.commands = [];
        toast(`${resource.name} ${checkbox.checked ? "abilitata" : "disabilitata"}.`);
        renderNativePackageSections();
      } catch (err) {
        checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
        toast(`Configurazione risorsa fallita: ${err.message}`, "error", 8000);
      }
    });
    row.append(checkbox, copy);
    el.packageResourceList.appendChild(row);
  }
}

async function changePackage(pkg, action) {
  const verb = action === "install" ? "installare" : "rimuovere";
  if (action === "install" && !confirm(`Vuoi ${verb} ${pkg.name}? I plugin di pi possono eseguire codice con i tuoi permessi.`)) return;
  const installedEntry = installedEntryForName(pkg.name);
  const scope = action === "remove" ? (installedEntry?.scope || "user") : el.packageScope.value;
  if (action === "remove" && !confirm(`Vuoi rimuovere ${pkg.name} dalla configurazione ${scope === "project" ? "del progetto" : "utente"} di pi?`)) return;
  state.packageBusy = pkg.name;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent = `— ${action === "install" ? "Installazione" : "Rimozione"} di ${pkg.name} —\n`;
  renderPackageStore();
  try {
    state.installedPackages = action === "install"
      ? await api.installPackage(pkg.name, scope)
      : await api.removePackage(pkg.name, scope);
    state.packageResources = await api.listPackageResources().catch(() => []);
    state.modelsCache = null;
    toast(`${pkg.name} ${action === "install" ? "installato" : "rimosso"}. Runtime di pi ricaricato.`);
  } catch (err) {
    el.packageLog.textContent += `✗ ${err.message}\n`;
    toast(`${pkg.name}: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

async function installManualSource() {
  const source = el.packageSource.value.trim();
  if (!source) return;
  if (!confirm(`Installare ${source} nello scope ${el.packageScope.value === "project" ? "progetto" : "utente"}? Può eseguire codice con i tuoi permessi.`)) return;
  state.packageBusy = source;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent = `— Installazione di ${source} —\n`;
  renderPackageStore();
  try {
    state.installedPackages = await api.installPackageSource(source, el.packageScope.value);
    state.packageResources = await api.listPackageResources().catch(() => []);
    el.packageSource.value = "";
    state.commands = [];
    toast("Sorgente installata; runtime Pi ricaricato.");
  } catch (err) {
    el.packageLog.textContent += `✗ ${err.message}\n`;
    toast(`Installazione fallita: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

async function removeInstalledSource(entry) {
  if (!confirm(`Rimuovere ${entry.source} dallo scope ${entry.scope === "project" ? "progetto" : "utente"}?`)) return;
  state.packageBusy = entry.source;
  try {
    state.installedPackages = await api.removePackageSource(entry.source, entry.scope);
    state.packageResources = await api.listPackageResources().catch(() => []);
    state.commands = [];
    toast("Pacchetto rimosso; runtime Pi ricaricato.");
  } catch (err) {
    toast(`Rimozione fallita: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

async function updatePackageTarget(target) {
  state.packageBusy = target;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent = `— Aggiornamento ${target} —\n`;
  renderPackageStore();
  try {
    state.installedPackages = await api.updatePackages(target);
    state.packageResources = await api.listPackageResources().catch(() => []);
    state.modelsCache = null;
    state.commands = [];
    toast(target === "models" ? "Cataloghi modelli aggiornati." : "Aggiornamento completato; runtime Pi ricaricato.");
  } catch (err) {
    el.packageLog.textContent += `✗ ${err.message}\n`;
    toast(`Aggiornamento fallito: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

function appendPackageOutput(line) {
  if (!el.modalPackages.open) return;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent += `${line}\n`;
  el.packageLog.scrollTop = el.packageLog.scrollHeight;
}

// ---------------------------------------------------------------------------
// Stats & status
// ---------------------------------------------------------------------------











// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------























// ---------------------------------------------------------------------------
// pi status / updates (external, independent from the app)
// ---------------------------------------------------------------------------

async function refreshPiStatus(openModalOnError = false) {
  try {
    const st = await api.updateStatus();
    el.piChip.className = "pi-status-button";
    if (!st.installed) {
      el.piChip.classList.add("missing");
      el.piChipText.textContent = "pi non installato";
      showEmptyHint(st);
      if (openModalOnError) openPiModal(st);
    } else if (st.updateAvailable) {
      el.piChip.classList.add("update");
      el.piChipText.textContent = `pi ${st.version} → ${st.latest} disponibile`;
      el.emptyHint.classList.add("hidden");
    } else {
      el.piChip.classList.add(t("tool.ok"));
      el.piChipText.textContent = `pi ${st.version}`;
      el.emptyHint.classList.add("hidden");
    }
    renderPiStatusBox(st);
    return st;
  } catch (err) {
    el.piChipText.textContent = "pi: ?";
    el.piChip.className = "pi-status-button missing";
    return null;
  }
}

function showEmptyHint(st) {
  el.emptyHint.classList.remove("hidden");
  el.emptyHint.innerHTML =
    `<strong>pi non risulta installato sul sistema.</strong><br/>` +
    `<p class="muted small">Pi Desktop usa il comando <code>pi</code> installato globalmente (mai una copia interna), ` +
    `così puoi aggiornare l'agente indipendentemente dall'app.</p>` +
    `<p class="mono small">npm install -g --ignore-scripts @earendil-works/pi-coding-agent<br/>` +
    `<span class="muted">oppure</span><br/>curl -fsSL https://pi.dev/install.sh | sh</p>` +
    `<button id="hint-install" class="btn primary">Installa ora con npm</button>`;
  el.emptyHint.querySelector("#hint-install").addEventListener("click", () => runMaintenance("install"));
}

function renderPiStatusBox(st) {
  if (!st) {
    el.piStatusBox.innerHTML = `<span class="muted">Stato non disponibile.</span>`;
    return;
  }
  if (!st.installed) {
    el.piStatusBox.innerHTML =
      `<strong style="color:var(--red)">Non installato</strong><br/>` +
      `<span class="muted small">L'app lo cercherà nel PATH (anche ~/.local/bin, /usr/local/bin).</span>`;
    el.btnPiInstall.classList.remove("hidden");
    el.btnPiUpdate.classList.add("hidden");
    return;
  }
  let html = `<strong>pi ${escapeHtml(st.version || "?")}</strong><br/>` +
    `<span class="muted small mono ellipsis" title="${escapeHtml(st.bin)}">${escapeHtml(st.bin)}</span>`;
  if (st.updateAvailable) {
    html += `<br/><span style="color:var(--amber)">Aggiornamento disponibile: ${escapeHtml(st.latest)}. L'aggiornamento usa l'updater di pi stesso (<code>pi update --self</code>): nessuna dipendenza dall'app.</span>`;
    el.btnPiUpdate.classList.remove("hidden");
    el.btnPiUpdate.classList.add("primary");
  } else {
    html += `<br/><span style="color:var(--green)">Aggiornato ✓ ultima versione su npm (${escapeHtml(st.latest || "n/d")}).</span>`;
    el.btnPiUpdate.classList.remove("primary");
    el.btnPiUpdate.classList.toggle("hidden", !st.latest);
  }
  el.btnPiInstall.classList.add("hidden");
  el.piStatusBox.innerHTML = html;
}

function openPiModal(st) {
  if (st) renderPiStatusBox(st);
  else refreshPiStatus().then((s) => renderPiStatusBox(s));
  el.modalPi.showModal();
}

async function runMaintenance(kind) {
  el.maintenanceLog.classList.remove("hidden");
  el.maintenanceLog.textContent = "";
  el.btnPiInstall.disabled = true;
  el.btnPiUpdate.disabled = true;
  const appendLine = (line) => {
    el.maintenanceLog.textContent += line + "\n";
    el.maintenanceLog.scrollTop = el.maintenanceLog.scrollHeight;
  };
  state.maintenanceAppend = appendLine;
  appendLine(`— ${kind === "install" ? "installazione" : "aggiornamento"} di pi (indipendente dall'app) —`);
  try {
    const res = await api.maintenance(kind);
    appendLine(res.ok ? "✓ riuscito" : "✗ fallito");
    if (res.status) renderPiStatusBox(res.status);
    await refreshPiStatus();
    if (res.ok) toast(kind === "install" ? "pi installato." : "pi aggiornato.");
  } finally {
    el.btnPiInstall.disabled = false;
    el.btnPiUpdate.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// App OTA (electron-updater, GitHub Releases — come gittree)
// ---------------------------------------------------------------------------
let appUpdateState = null;

async function setupAppUpdates() {
  const btn = el.btnAppUpdate;
  if (!btn) return;
  const icon = btn.querySelector("i");
  const label = btn.querySelector("span");
  btn.addEventListener("click", async () => {
    if (appUpdateState?.status === "available") {
      btn.disabled = true;
      const res = await api.downloadAppUpdate();
      if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
    } else if (appUpdateState?.status === "downloaded") {
      const res = await api.installAppUpdate();
      if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
    } else {
      btn.disabled = true;
      const res = await api.checkAppUpdate();
      if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
      setTimeout(() => { if (appUpdateState?.status === "idle") btn.disabled = false; }, 800);
    }
  });
  api.on("update:state", handleAppUpdateState);
  try {
    const initial = await api.getAppUpdateState();
    handleAppUpdateState(initial);
  } catch {}
}

function handleAppUpdateState(state) {
  if (!state) return;
  const prev = appUpdateState?.status;
  appUpdateState = state;
  const btn = el.btnAppUpdate;
  if (!btn) return;
  const icon = btn.querySelector("i");
  const label = btn.querySelector("span");
  const visible = ["available", "downloading", "downloaded"].includes(String(state.status));
  btn.classList.toggle("hidden", !visible);
  btn.disabled = state.status === "downloading" || state.status === "checking";
  if (state.status === "available") {
    if (icon) icon.setAttribute("data-lucide", "download");
    if (label) label.textContent = t("updates.app.availableVersion", { version: state.availableVersion || "" });
    btn.title = t("updates.app.availableVersion", { version: state.availableVersion || "" });
    btn.classList.remove("is-downloading");
    if (prev !== "available") toast(t("updates.app.availableVersion", { version: state.availableVersion || "" }), "info");
  } else if (state.status === "downloading") {
    if (icon) icon.setAttribute("data-lucide", "loader-circle");
    if (label) label.textContent = t("updates.app.downloading", { progress: state.progress || 0 });
    btn.title = t("updates.app.downloading", { progress: state.progress || 0 });
    btn.classList.add("is-downloading");
  } else if (state.status === "downloaded") {
    if (icon) icon.setAttribute("data-lucide", "refresh-cw");
    if (label) label.textContent = t("updates.app.restart");
    btn.title = t("updates.app.ready");
    btn.classList.remove("is-downloading");
    if (prev !== "downloaded") toast(t("updates.app.ready"), "success");
  } else if (state.status === "error" && state.error) {
    toast(t("updates.app.failed", { error: state.error }), "error");
  }
  refreshIcons();
}

// ---------------------------------------------------------------------------
// Extension UI bridge (dialogs requested by pi extensions)
// ---------------------------------------------------------------------------

let uiRequest = null;

function handleUiRequest(msg) {
  switch (msg.method) {
    case "notify":
      toast(msg.message || "", msg.notifyType === "warning" ? "warn" : msg.notifyType === "error" ? "error" : "info");
      break;
    case "setTitle":
      if (msg.title) document.title = `Pi Desktop — ${msg.title}`;
      break;
    case "set_editor_text":
      if (typeof msg.text === "string") {
        el.input.value = msg.text;
        autosize();
        el.input.focus();
      }
      break;
    case "setStatus":
      updateExtensionStatus(msg.statusKey, msg.statusText);
      break;
    case "setWidget":
      updateExtensionWidget(msg.widgetKey, msg.widgetLines, msg.widgetPlacement);
      break;
    case "select":
    case "confirm":
    case "input":
    case "editor":
      showDialog(msg);
      break;
  }
}

function stripAnsi(text) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.stripAnsi) return window.piUtils.stripAnsi.apply(null, Array.from(arguments)); 
  return String(text || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
 }

function updateExtensionStatus(key, text) {
  if (!key) return;
  if (text == null || text === "") state.extensionStatuses.delete(key);
  else state.extensionStatuses.set(key, stripAnsi(text));
  el.extensionStatuses.innerHTML = "";
  for (const [statusKey, statusText] of state.extensionStatuses) {
    const status = document.createElement("span");
    status.className = "extension-status";
    status.title = statusKey;
    status.textContent = statusText;
    el.extensionStatuses.appendChild(status);
  }
  el.extensionStatuses.classList.toggle("hidden", !state.extensionStatuses.size);
}

function updateExtensionWidget(key, lines, placement = "aboveEditor") {
  if (!key) return;
  if (!Array.isArray(lines)) state.extensionWidgets.delete(key);
  else state.extensionWidgets.set(key, { lines: lines.map(stripAnsi), placement: placement || "aboveEditor" });
  for (const [target, expected] of [
    [el.extensionWidgetsAbove, "aboveEditor"],
    [el.extensionWidgetsBelow, "belowEditor"],
  ]) {
    target.innerHTML = "";
    for (const [widgetKey, widget] of state.extensionWidgets) {
      if (widget.placement !== expected) continue;
      const block = document.createElement("div");
      block.className = "extension-widget";
      block.title = widgetKey;
      block.textContent = widget.lines.join("\n");
      target.appendChild(block);
    }
    target.classList.toggle("hidden", !target.children.length);
  }
}

function showDialog(msg) {
  uiRequest = msg;
  el.uiTitle.textContent = msg.title || "pi";
  el.uiMessage.textContent = msg.message || "";
  el.uiOptions.innerHTML = "";
  el.uiInputWrap.classList.add("hidden");
  el.uiEditor.classList.add("hidden");
  el.uiOk.classList.add("hidden");

  if (msg.method === "select") {
    for (const opt of msg.options || []) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = opt;
      b.addEventListener("click", () => answerUi({ value: opt }));
      el.uiOptions.appendChild(b);
    }
  } else if (msg.method === "confirm") {
    el.uiOk.textContent = "Conferma";
    el.uiOk.classList.remove("hidden");
    el.uiOk.onclick = () => answerUi({ confirmed: true });
  } else if (msg.method === "input") {
    el.uiInputWrap.classList.remove("hidden");
    el.uiInput.value = "";
    el.uiOk.textContent = "OK";
    el.uiOk.classList.remove("hidden");
    el.uiOk.onclick = () => answerUi({ value: el.uiInput.value });
    setTimeout(() => el.uiInput.focus(), 50);
  } else if (msg.method === "editor") {
    el.uiEditor.classList.remove("hidden");
    el.uiEditor.value = msg.prefill || "";
    el.uiOk.textContent = "OK";
    el.uiOk.classList.remove("hidden");
    el.uiOk.onclick = () => answerUi({ value: el.uiEditor.value });
  }
  el.modalUi.showModal();
}

function answerUi(payload) {
  const req = uiRequest;
  uiRequest = null;
  el.modalUi.close();
  if (req) api.uiRespond(req.id, payload);
}

// ---------------------------------------------------------------------------
// pi events
// ---------------------------------------------------------------------------

api.on("pi:event", (msg) => {
  if (msg.tabId) {
    const tab = state.tabs.find((candidate) => candidate.id === msg.tabId);
    if (tab) {
      if (msg.type === "agent_start") tab.busy = true;
      if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "pi-started") tab.busy = false;
      if (msg.type === "tab_status") tab.busy = Boolean(msg.busy);
      renderTabs();
      renderProjects();
    }
    if (state.activeTabId && msg.tabId !== state.activeTabId && msg.type !== "extension_ui_request") {
      if (msg.type === "agent_settled" || msg.type === "pi-exit" || msg.type === "tab_status") {
        refreshSessionsSoon();
        refreshTabsSoon();
      }
      return;
    }
  }
  switch (msg.type) {
    case "agent_start":
      state.lastAssistantErrored = false;
      state.lastAssistantErrorWrap = null;
      state.retryAttempt = 0;
      setBusy(true);
      setUserMessageStatus(state.activeUserMessage, "processing");
      break;
    case "agent_settled":
      setUserMessageStatus(state.activeUserMessage, state.lastAssistantErrored ? "failed" : "done");
      state.activeUserMessage = null;
      state.lastAssistantErrorWrap = null;
      state.retryAttempt = 0;
      setBusy(false);
      refreshStats();
      refreshSessionsSoon();
      break;
    case "message_start":
      if (msg.message?.role === "assistant") {
        setUserMessageStatus(state.activeUserMessage, "processing");
        beginStreamAssistant();
      } else if (msg.message?.role === "user") {
        const messageText = textOfBlocks(msg.message.content);
        const queuedIndex = state.queuedUserMessages.findIndex((entry) => entry.message === messageText);
        if (queuedIndex >= 0) {
          const [entry] = state.queuedUserMessages.splice(queuedIndex, 1);
          state.activeUserMessage = entry.userMessage;
          setUserMessageStatus(entry.userMessage, "processing");
        }
      }
      break;
    case "message_update":
      streamApplyDelta(msg);
      break;
    case "message_end":
      endStreamAssistant(msg.message);
      break;
    case "turn_end":
      // Ensure tool results appear even if tool_execution events were missed.
      refreshStats();
      break;
    case "tool_execution_start": {
      const toolName = msg.toolName || "tool";
      const card = state.tools.get(msg.toolCallId) || makeToolCard(toolName, compactToolArgs(toolName, msg.args));
      card.dataset.tool = toolName.toLowerCase();
      card.querySelector(".tool-name").innerHTML = `${icon(toolIconName(toolName))} ${escapeHtml(toolDisplayName(toolName))}`;
      const argsEl = card.querySelector(".tool-args");
      argsEl.textContent = compactToolArgs(toolName, msg.args);
      argsEl.title = fullToolArgs(msg.args);
      state.tools.set(msg.toolCallId, card);
      refreshIcons();
      break;
    }
    case "tool_execution_update": {
      const card = state.tools.get(msg.toolCallId);
      if (card) {
        const text = textOfBlocks(msg.partialResult?.content);
        card.querySelector(".tool-body pre").textContent = text;
        renderBlockMedia(card.querySelector(".tool-body"), msg.partialResult?.content, "Anteprima");
      }
      break;
    }
    case "tool_execution_end": {
      const card = state.tools.get(msg.toolCallId);
      if (card) {
        setToolCardResult(card, textOfBlocks(msg.result?.content), Boolean(msg.isError), msg.result?.content);
        state.tools.delete(msg.toolCallId);
      }
      break;
    }
    case "bash_execution_update": {
      if (state.directBashCard) {
        const pre = state.directBashCard.querySelector(".tool-body pre");
        pre.textContent += msg.delta || "";
        scheduleScroll();
      }
      break;
    }
    case "queue_update":
      state.nativeQueue = { steering: msg.steering || [], followUp: msg.followUp || [] };
      renderQueuePanel();
      break;
    case "compaction_start":
      el.statusActivity.textContent = "compazione del contesto…";
      break;
    case "compaction_end":
      el.statusActivity.textContent = "";
      toast("Contesto compattato.", "info");
      break;
    case "auto_retry_start":
      state.lastAssistantErrorWrap?.remove();
      state.lastAssistantErrorWrap = null;
      state.lastAssistantErrored = false;
      state.retryAttempt = msg.attempt || state.retryAttempt + 1;
      el.statusActivity.textContent = `errore transitorio — retry ${msg.attempt}/${msg.maxAttempts}`;
      setUserMessageStatus(state.activeUserMessage, "retrying");
      if (state.activeUserMessage?.isConnected) {
        const status = state.activeUserMessage.querySelector(".message-status");
        const receivedAt = state.activeUserMessage.dataset.receivedAt;
        if (status) {
          status.textContent = `ricevuto${receivedAt ? ` alle ${receivedAt}` : ""} · provider non disponibile, tentativo ${msg.attempt}/${msg.maxAttempts}…`;
        }
      }
      break;
    case "auto_retry_end":
      el.statusActivity.textContent = state.busy ? "agente al lavoro…" : "";
      if (msg.success) {
        state.lastAssistantErrored = false;
        setUserMessageStatus(state.activeUserMessage, "processing");
      } else {
        state.lastAssistantErrored = true;
        setUserMessageStatus(state.activeUserMessage, "failed");
        toast(`Richiesta fallita dopo ${msg.attempt} tentativi`, "error");
      }
      break;
    case "summarization_retry_scheduled":
      el.statusActivity.textContent = `riepilogo in retry ${msg.attempt}/${msg.maxAttempts}`;
      break;
    case "summarization_retry_attempt_start":
      el.statusActivity.textContent = "nuovo tentativo di riepilogo…";
      break;
    case "summarization_retry_finished":
      el.statusActivity.textContent = state.busy ? "agente al lavoro…" : "";
      break;
    case "extension_error":
      toast(`Estensione in errore: ${msg.error}`, "error");
      break;
    case "extension_ui_request":
      handleUiRequest(msg);
      break;
    case "pi-exit":
      if (msg.info && !msg.info.expected) {
        toast("Il processo pi si è chiuso. Ripartirà al prossimo comando.", "warn", 6000);
      }
      setUserMessageStatus(state.activeUserMessage, "error");
      state.activeUserMessage = null;
      setBusy(false);
      break;
    default:
      break;
  }
});

function parsedToolArgs(args) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.parsedToolArgs) return window.piUtils.parsedToolArgs.apply(null, Array.from(arguments)); 
  if (args && typeof args === "object") return args;
  if (typeof args !== "string") return {};
  try { return JSON.parse(args); } catch { return { value: args }; }
 }

function fullToolArgs(args) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.fullToolArgs) return window.piUtils.fullToolArgs.apply(null, Array.from(arguments)); 
  try {
    return typeof args === "string" ? args : JSON.stringify(args) || "";
  } catch {
    return "";
  }
 }

function compactProjectPath(value) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.compactProjectPath) return window.piUtils.compactProjectPath.apply(null, Array.from(arguments)); 
  const input = String(value || "").replace(/\\/g, "/");
  const cwd = String(state.settings?.cwd || "").replace(/\\/g, "/").replace(/\/$/, "");
  if (cwd && (input === cwd || input.startsWith(`${cwd}/`))) return input.slice(cwd.length + 1) || ".";
  const parts = input.split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : input;
 }

function changedLineCounts(args) { if(typeof window!=="undefined" && window.piUtils && window.piUtils.changedLineCounts) return window.piUtils.changedLineCounts.apply(null, Array.from(arguments)); 
  const edits = Array.isArray(args.edits) ? args.edits : [args];
  let removed = 0;
  let added = 0;
  for (const edit of edits) {
    const oldText = edit.oldText ?? edit.old_string ?? "";
    const newText = edit.newText ?? edit.new_string ?? edit.content ?? "";
    if (oldText) removed += String(oldText).split("\n").length;
    if (newText) added += String(newText).split("\n").length;
  }
  return { added, removed };
 }

function compactToolArgs(toolName, rawArgs) {
  const name = String(toolName || "").toLowerCase();
  const args = parsedToolArgs(rawArgs);
  const filePath = args.path || args.file || args.filePath || args.filename;
  if (name === "read") {
    const range = args.offset != null ? ` · da riga ${args.offset}` : "";
    return `${compactProjectPath(filePath)}${range}`;
  }
  if (["edit", "write"].includes(name)) {
    const { added, removed } = changedLineCounts(args);
    const delta = added || removed ? ` · +${added} −${removed}` : "";
    return `${compactProjectPath(filePath)}${delta}`;
  }
  if (["grep", "find", "search"].includes(name)) {
    const query = args.pattern || args.query || args.glob || args.name || "";
    const location = compactProjectPath(args.path || args.cwd || ".");
    return [query, location && `in ${location}`].filter(Boolean).join(" · ");
  }
  if (name === "ls") return compactProjectPath(args.path || args.cwd || ".");
  if (["bash", "shell", "powershell"].some((value) => name.startsWith(value))) return String(args.command || args.value || "").trim();
  return fullToolArgs(rawArgs).slice(0, 160);
}

let sessionsTimer = null;
let tabsTimer = null;




api.on("pi:maintenance-output", (line) => {
  if (state.maintenanceAppend) state.maintenanceAppend(line);
});

api.on("pi:package-output", appendPackageOutput);

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wireUi() {
  initSidebarResize();
  initChatTooltip();
  initSearchEnhancement();
  // Pulsante "Vai in fondo" — visibile solo quando l'utente è lontano dal fondo
  if (el.chat) {
    el.chat.addEventListener("scroll", scheduleScrollVisibility, { passive: true });
    window.addEventListener("resize", scheduleScrollVisibility);
  }
  if (el.btnScrollBottom) {
    el.btnScrollBottom.addEventListener("click", () => {
      try {
        el.chat.scrollTo({ top: el.chat.scrollHeight, behavior: "smooth" });
      } catch {
        jumpToBottom();
      }
      // Nascondi subito dopo il click; lo scroll listener lo confermerà
      queueMicrotask(updateScrollBottomVisibility);
    });
  }
  el.sendBtn.addEventListener("click", () => sendMessage());
  el.stopBtn.addEventListener("click", abortCurrentWork);
  el.input.addEventListener("keydown", (e) => {
    if (!el.slashSuggestions.classList.contains("hidden")) {
      const commands = slashMatches();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.slashSelection = Math.min(commands.length - 1, state.slashSelection + 1);
        renderSlashSuggestions();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        state.slashSelection = Math.max(0, state.slashSelection - 1);
        renderSlashSuggestions();
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && commands[state.slashSelection]) {
        e.preventDefault();
        applySlashSuggestion(commands[state.slashSelection]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        hideSlashSuggestions();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      sendMessage(state.busy ? state.queueBehavior : undefined);
    } else if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      sendMessage("followUp");
    }
  });
  el.input.addEventListener("input", () => {
    autosize();
    state.slashSelection = 0;
    renderSlashSuggestions();
  });
  el.input.addEventListener("paste", pasteClipboardImages);
  el.input.addEventListener("click", renderSlashSuggestions);
  el.input.addEventListener("blur", () => setTimeout(hideSlashSuggestions, 120));
  el.attachBtn.addEventListener("click", () => pickAttachments("files"));
  el.attachImageBtn.addEventListener("click", () => pickAttachments("images"));
  for (const button of el.queueBehaviorButtons) {
    button.addEventListener("click", () => {
      state.queueBehavior = button.dataset.queueBehavior;
      for (const candidate of el.queueBehaviorButtons) candidate.classList.toggle("active", candidate === button);
      setBusy(state.busy);
    });
  }

  el.newChat.addEventListener("click", () => newChat());
  el.topNewChat.addEventListener("click", () => newChat());
  el.commandsBtn.addEventListener("click", openCommandPalette);
  el.treeBtn.addEventListener("click", openSessionTree);
  el.sessionToolsBtn.addEventListener("click", openSessionTools);
  el.toggleSidebar.addEventListener("click", () => {
    setSidebarVisible(el.sidebar.classList.contains("collapsed"));
  });
  el.themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  el.addProject.addEventListener("click", async () => {
    try {
      const updated = await api.addProject();
      if (!updated) return;
      state.settings = updated;
      state.expandedProjects.add(updated.cwd);
      el.statusCwd.textContent = updated.cwd;
      await newChat(updated.cwd);
    } catch (err) {
      toast(`Impossibile aggiungere il progetto: ${err.message}`, "error");
    }
  });
  el.sessionSearch.addEventListener("input", renderProjects);

  // commands, tree and session actions
  el.commandsClose.addEventListener("click", () => el.modalCommands.close());
  el.commandSearch.addEventListener("input", () => {
    state.commandSelection = 0;
    renderCommandPalette();
  });
  el.commandSearch.addEventListener("keydown", (event) => {
    const commands = filteredCommands();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.commandSelection = Math.min(commands.length - 1, state.commandSelection + 1);
      renderCommandPalette();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.commandSelection = Math.max(0, state.commandSelection - 1);
      renderCommandPalette();
    } else if (event.key === "Enter" && commands[state.commandSelection]) {
      event.preventDefault();
      chooseCommand(commands[state.commandSelection]);
    }
  });
  el.treeClose.addEventListener("click", () => el.modalTree.close());
  el.treeRefresh.addEventListener("click", loadSessionTree);
  el.childSession.addEventListener("click", newChildSession);
  el.cloneSession.addEventListener("click", cloneActiveSession);
  el.sessionToolsClose.addEventListener("click", () => el.modalSessionTools.close());
  el.sessionRename.addEventListener("click", renameSession);
  el.sessionNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renameSession();
  });
  el.steeringMode.addEventListener("change", async () => {
    try { await api.setSteeringMode(el.steeringMode.value); }
    catch (err) { toast(err.message, "error"); }
  });
  el.followUpMode.addEventListener("change", async () => {
    try { await api.setFollowUpMode(el.followUpMode.value); }
    catch (err) { toast(err.message, "error"); }
  });
  el.autoCompaction.addEventListener("change", async () => {
    try { await api.setAutoCompaction(el.autoCompaction.checked); }
    catch (err) { toast(err.message, "error"); }
  });
  el.autoRetry.addEventListener("change", async () => {
    try {
      await api.setAutoRetry(el.autoRetry.checked);
      state.autoRetryEnabled = el.autoRetry.checked;
    } catch (err) { toast(err.message, "error"); }
  });
  el.compactBtn.addEventListener("click", compactSession);
  el.copyLast.addEventListener("click", async () => {
    try {
      const data = await api.getLastAssistantText();
      if (!data.text) return toast("Non c’è ancora una risposta da copiare.", "warn");
      await navigator.clipboard.writeText(data.text);
      toast("Ultima risposta copiata.");
    } catch (err) { toast(`Copia fallita: ${err.message}`, "error"); }
  });
  el.exportHtml.addEventListener("click", async () => {
    try {
      const result = await api.exportHtml();
      if (!result.cancelled) toast(`Sessione esportata in ${result.path}`);
    } catch (err) { toast(`Export fallito: ${err.message}`, "error"); }
  });
  el.abortRetry.addEventListener("click", async () => {
    try { await api.abortRetry(); toast("Retry interrotto."); }
    catch (err) { toast(`Nessun retry da interrompere: ${err.message}`, "warn"); }
  });

  // provider dropdown
  el.providerBtn.addEventListener("click", async () => {
    const isOpening = el.providerMenu.classList.contains("hidden");
    closeMenus();
    if (!isOpening) return;
    el.providerMenu.classList.remove("hidden");
    try {
      await loadModels(true);
      renderProviderMenu();
      updateModelLabel();
    } catch (err) {
      el.providerList.innerHTML = `<div class="menu-empty">${escapeHtml(err.message)}</div>`;
    }
  });

  // model dropdown
  el.modelBtn.addEventListener("click", async () => {
    const isOpening = el.modelMenu.classList.contains("hidden");
    closeMenus();
    if (!isOpening) return;
    el.modelMenu.classList.remove("hidden");
    el.modelSearch.value = "";
    try {
      await loadModels(true);
      renderModelMenu("");
    } catch (err) {
      el.modelList.innerHTML = `<div class="menu-empty">${escapeHtml(err.message)}</div>`;
    }
    el.modelSearch.focus();
  });
  el.modelSearch.addEventListener("input", () => renderModelMenu(el.modelSearch.value));

  // thinking dropdown
  el.thinkingBtn.addEventListener("click", () => {
    const isOpening = el.thinkingMenu.classList.contains("hidden");
    closeMenus();
    if (!isOpening) return;
    el.thinkingMenu.classList.remove("hidden");
    renderThinkingMenu();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown")) closeMenus();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".project-row") && !e.target.closest(".project-menu")) {
      if (state.openProjectMenu) {
        state.openProjectMenu = null;
        renderProjects();
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.openProjectMenu) {
      state.openProjectMenu = null;
      renderProjects();
    }
  });

  // links -> external browser
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (a && /^https?:/i.test(a.getAttribute("href"))) {
      e.preventDefault();
      api.openExternal(a.href);
    }
  });

  // code copy buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cb-copy");
    if (!btn) return;
    const pre = btn.closest(".codeblock")?.querySelector("pre");
    if (pre) {
      navigator.clipboard.writeText(pre.textContent);
      btn.textContent = "copiato!";
      setTimeout(() => (btn.textContent = "copia"), 1200);
    }
  });

  // pi chip & modal
  el.piChip.addEventListener("click", () => openPiModal());
  el.btnPiClose.addEventListener("click", () => el.modalPi.close());
  el.btnPiRecheck.addEventListener("click", () => refreshPiStatus());
  el.btnPiInstall.addEventListener("click", () => runMaintenance("install"));
  el.btnPiUpdate.addEventListener("click", () => runMaintenance("update"));

  // settings modal + i18n language
  if (el.settingLanguage) {
    el.settingLanguage.value = (i18n && i18n.getLang()) || "it";
    el.settingLanguage.addEventListener("change", async () => {
      const lang = el.settingLanguage.value === "en" ? "en" : "it";
      if (i18n) i18n.setLang(lang);
      refreshIcons();
      renderProjects();
      renderProviderSettings();
      renderPackageStore();
      updateModelLabel();
      try { await api.setSettings({ language: lang }); state.settings.language = lang; } catch {}
      toast(lang === "en" ? "Language: English" : "Lingua: Italiano");
    });
  }
  if (i18n) i18n.applyI18n();
  el.btnSettingsOpen.addEventListener("click", () => {
    el.settingCwd.textContent = state.settings.cwd || "";
    el.settingPiPath.value = state.settings.piPath || "";
    el.settingSessionsDir.value = state.settings.sessionsDir || "";
    if (el.settingLanguage) el.settingLanguage.value = (i18n && i18n.getLang()) || state.settings.language || "it";
    switchSettingsTab("general");
    el.modalSettings.showModal();
    if (i18n) i18n.applyI18n();
  });
  for (const tab of el.settingsTabs) {
    tab.addEventListener("click", () => switchSettingsTab(tab.dataset.settingsTab));
  }
  el.providerSettingsSearch.addEventListener("input", renderProviderSettings);
  el.piSettingsSave.addEventListener("click", saveNativePiSettings);
  el.authCancel.addEventListener("click", () => {
    if (!state.authFlow) return el.modalAuth.close();
    if (state.authFlow.requestId) respondToAuthPrompt("", true);
    api.cancelProviderLogin(state.authFlow.providerId).catch(() => {});
    el.modalAuth.close();
  });
  el.authInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !el.authOk.classList.contains("hidden")) {
      event.preventDefault();
      respondToAuthPrompt(el.authInput.value);
    }
  });

  // package store
  el.packagesBtn.addEventListener("click", () => {
    el.packageLog.classList.add("hidden");
    el.packageLog.textContent = "";
    el.modalPackages.showModal();
    loadPackageStore({ resetPage: true });
    setTimeout(() => el.packageSearch.focus(), 50);
  });
  el.packagesClose.addEventListener("click", () => el.modalPackages.close());
  el.packagesDone.addEventListener("click", () => el.modalPackages.close());
  el.packagesRefresh.addEventListener("click", () => loadPackageStore());
  el.packageSourceInstall.addEventListener("click", installManualSource);
  el.packageSource.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      installManualSource();
    }
  });
  el.packagesUpdate.addEventListener("click", () => updatePackageTarget("extensions"));
  el.modelsUpdate.addEventListener("click", () => updatePackageTarget("models"));
  el.packagePrev.addEventListener("click", () => {
    if (state.packagePage > 1) {
      state.packagePage -= 1;
      loadPackageStore();
    }
  });
  el.packageNext.addEventListener("click", () => {
    const pages = Math.max(1, Math.ceil(state.packageTotal / state.packagePageSize));
    if (state.packagePage < pages) {
      state.packagePage += 1;
      loadPackageStore();
    }
  });
  let packageSearchTimer = null;
  el.packageSearch.addEventListener("input", () => {
    clearTimeout(packageSearchTimer);
    packageSearchTimer = setTimeout(() => loadPackageStore({ resetPage: true }), 350);
  });
  el.packageType.addEventListener("change", () => loadPackageStore({ resetPage: true }));
  el.packageSort.addEventListener("change", () => loadPackageStore({ resetPage: true }));
  el.btnPickCwd.addEventListener("click", async () => {
    const dir = await api.pickDirectory(t("dialog.pickCwd"));
    if (dir) el.settingCwd.textContent = dir;
  });
  el.btnSettingsClose.addEventListener("click", () => el.modalSettings.close());
  el.btnSettingsSave.addEventListener("click", async () => {
    const previousCwd = state.settings.cwd;
    const lang = el.settingLanguage ? (el.settingLanguage.value === "en" ? "en" : "it") : (state.settings.language || "it");
    const patch = {
      cwd: el.settingCwd.textContent.trim(),
      piPath: el.settingPiPath.value.trim(),
      sessionsDir: el.settingSessionsDir.value.trim(),
      language: lang,
    };
    try {
      state.settings = await api.setSettings(patch);
      if (i18n && lang !== i18n.getLang()) i18n.setLang(lang);
      state.expandedProjects.add(state.settings.cwd);
      el.statusCwd.textContent = state.settings.cwd || "";
      el.modalSettings.close();
      toast(t("toast.saveSettings"));
      if (previousCwd !== state.settings.cwd) await newChat(state.settings.cwd);
      else await refreshSessions();
    } catch (err) {
      toast(t("toast.saveSettingsFail", {msg: err.message}), "error");
    }
  });

  // generic dialog controls
  el.uiCancel.addEventListener("click", () => answerUi({ cancelled: true }));

  // keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const command = e.ctrlKey || e.metaKey;
    if (command && e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      openCommandPalette();
    } else if (command && e.key.toLowerCase() === "n") {
      e.preventDefault();
      newChat();
    } else if (command && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setSidebarVisible(true);
      el.sessionSearch.focus();
      el.sessionSearch.select();
    } else if (command && e.key.toLowerCase() === "b") {
      e.preventDefault();
      setSidebarVisible(el.sidebar.classList.contains("collapsed"));
    } else if (command && e.key.toLowerCase() === "l") {
      e.preventDefault();
      el.modelBtn.click();
    } else if (e.key === "Escape" && state.busy && !uiRequest) {
      abortCurrentWork();
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  state.settings = await api.getSettings();
  // init language from settings or localStorage
  const initialLang = state.settings.language === "en" || state.settings.language === "it" ? state.settings.language : (i18n ? i18n.getLang() : "it");
  if (i18n && initialLang !== i18n.getLang()) i18n.setLang(initialLang);
  else if (i18n) i18n.applyI18n();
  if (state.settings.sidebarVisible === false) el.sidebar.classList.add("collapsed");
  el.statusCwd.textContent = state.settings.cwd || "";
  state.expandedProjects.add(state.settings.cwd);
  setConversationMode(false, false);

  wireUi();
  setupAppUpdates();
  const savedTheme = localStorage.getItem("pi-desktop-theme");
  const preferredTheme = savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferredTheme);
  refreshIcons();

  // Start an ephemeral agent so models/state are ready; persistence kicks in
  // automatically on the first real prompt (handled in the main process).
  try {
    const started = await api.start({ persist: false });
    state.activeTabId = started.tabId || state.activeTabId;
    await refreshTabs();
    await refreshHeaderFromState();
    console.info("[pi-desktop] agente avviato");
  } catch (err) {
    if (err.code === "PI_NOT_INSTALLED" || /non installato/i.test(err.message)) {
      showEmptyHint(null);
    } else {
      toast(`Avvio agente: ${err.message}`, "error", 8000);
    }
  }

  await Promise.all([refreshSessions(), refreshTabs(), refreshPiStatus(false)]);
  el.emptyState.classList.remove("hidden");
  el.input.focus();

  // Periodic light refresh of history + update badge.
  setInterval(() => {
    refreshSessions();
    refreshPiStatus();
  }, 30000);
}

boot();
