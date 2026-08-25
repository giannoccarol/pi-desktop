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

const el = {
  main: $("#main"),
  sidebar: $("#sidebar"),
  projectsList: $("#projects-list"),
  sessionSearch: $("#session-search"),
  addProject: $("#btn-add-project"),
  sessionsCount: $("#sessions-count"),
  newChat: $("#btn-new-chat"),
  topNewChat: $("#top-new-chat"),
  commandsBtn: $("#btn-commands"),
  treeBtn: $("#btn-tree"),
  sessionToolsBtn: $("#btn-session-tools"),
  toggleSidebar: $("#btn-toggle-sidebar"),
  chatTabs: $("#chat-tabs"),
  themeBtn: $("#btn-theme"),
  chat: $("#chat"),
  messages: $("#messages"),
  emptyState: $("#empty-state"),
  emptyHint: $("#empty-hint"),
  input: $("#input"),
  slashSuggestions: $("#slash-suggestions"),
  attachmentTray: $("#attachment-tray"),
  attachBtn: $("#btn-attach"),
  attachImageBtn: $("#btn-attach-image"),
  composerWrap: $("#composer-wrap"),
  composerActions: $(".composer-actions"),
  modelDock: $("#model-dock"),
  sendGroup: $(".send-group"),
  sendBtn: $("#btn-send"),
  stopBtn: $("#btn-stop"),
  queuedNote: $("#queued-note"),
  busySendChoice: $("#busy-send-choice"),
  queueBehaviorButtons: document.querySelectorAll("[data-queue-behavior]"),
  extensionStatuses: $("#extension-statuses"),
  extensionWidgetsAbove: $("#extension-widgets-above"),
  extensionWidgetsBelow: $("#extension-widgets-below"),
  statusCwd: $("#status-cwd"),
  statusActivity: $("#status-activity"),
  statusTokens: $("#status-tokens"),
  modelBtn: $("#model-btn"),
  modelLabel: $("#model-label"),
  modelMenu: $("#model-menu"),
  modelSearch: $("#model-search"),
  modelList: $("#model-list"),
  providerBtn: $("#provider-btn"),
  providerLabel: $("#provider-label"),
  providerMenu: $("#provider-menu"),
  providerList: $("#provider-list"),
  thinkingBtn: $("#thinking-btn"),
  thinkingLabel: $("#thinking-label"),
  thinkingMenu: $("#thinking-menu"),
  thinkingList: $("#thinking-list"),
  thinkingDropdown: $("#thinking-dropdown"),
  piChip: $("#pi-chip"),
  piChipText: $("#pi-chip-text"),
  modalPi: $("#modal-pi"),
  piStatusBox: $("#pi-status-box"),
  btnPiInstall: $("#btn-pi-install"),
  btnPiUpdate: $("#btn-pi-update"),
  btnPiRecheck: $("#btn-pi-recheck"),
  btnPiClose: $("#btn-pi-close"),
  maintenanceLog: $("#maintenance-log"),
  modalSettings: $("#modal-settings"),
  settingCwd: $("#setting-cwd"),
  btnPickCwd: $("#btn-pick-cwd"),
  settingPiPath: $("#setting-pipath"),
  settingSessionsDir: $("#setting-sessionsdir"),
  settingLanguage: $("#setting-language"),
  btnSettingsSave: $("#btn-settings-save"),
  btnSettingsClose: $("#btn-settings-close"),
  btnSettingsOpen: $("#btn-settings"),
  settingsTabs: document.querySelectorAll(".settings-tab"),
  settingsGeneral: $("#settings-general"),
  settingsRuntime: $("#settings-runtime"),
  settingsProviders: $("#settings-providers"),
  projectTrust: $("#setting-project-trust"),
  defaultTrust: $("#setting-default-trust"),
  transport: $("#setting-transport"),
  enabledModels: $("#setting-enabled-models"),
  nativeTools: document.querySelectorAll(".native-tools input[type=checkbox]"),
  shellPath: $("#setting-shell-path"),
  shellPrefix: $("#setting-shell-prefix"),
  compactReserve: $("#setting-compact-reserve"),
  compactKeep: $("#setting-compact-keep"),
  retryMax: $("#setting-retry-max"),
  retryDelay: $("#setting-retry-delay"),
  compactEnabled: $("#setting-compact-enabled"),
  retryEnabled: $("#setting-retry-enabled"),
  imageResize: $("#setting-image-resize"),
  blockImages: $("#setting-block-images"),
  projectTrustNote: $("#project-trust-note"),
  piSettingsSave: $("#btn-pi-settings-save"),
  providerSettingsSearch: $("#provider-settings-search"),
  providerSettingsList: $("#provider-settings-list"),
  packagesBtn: $("#btn-packages"),
  modalPackages: $("#modal-packages"),
  packagesClose: $("#btn-packages-close"),
  packagesDone: $("#btn-packages-done"),
  packagesRefresh: $("#btn-packages-refresh"),
  packageSearch: $("#package-search"),
  packageType: $("#package-type"),
  packageSort: $("#package-sort"),
  packageList: $("#package-list"),
  packagePrev: $("#package-prev"),
  packageNext: $("#package-next"),
  packagePageInfo: $("#package-page-info"),
  packageCatalogLink: $("#package-catalog-link"),
  packageLog: $("#package-log"),
  packageSource: $("#package-source"),
  packageScope: $("#package-scope"),
  packageSourceInstall: $("#btn-package-source-install"),
  packagesUpdate: $("#btn-packages-update"),
  modelsUpdate: $("#btn-models-update"),
  packageInstalledList: $("#package-installed-list"),
  packageInstalledCount: $("#package-installed-count"),
  packageResourceList: $("#package-resource-list"),
  packageResourceCount: $("#package-resource-count"),
  modalUi: $("#modal-ui"),
  uiTitle: $("#ui-title"),
  uiMessage: $("#ui-message"),
  uiOptions: $("#ui-options"),
  uiInputWrap: $("#ui-input-wrap"),
  uiInput: $("#ui-input"),
  uiEditor: $("#ui-editor"),
  uiOk: $("#ui-ok"),
  uiCancel: $("#ui-cancel"),
  modalCommands: $("#modal-commands"),
  commandsClose: $("#btn-commands-close"),
  commandSearch: $("#command-search"),
  commandList: $("#command-list"),
  modalTree: $("#modal-tree"),
  treeClose: $("#btn-tree-close"),
  treeRefresh: $("#btn-tree-refresh"),
  treeList: $("#tree-list"),
  treeSummary: $("#tree-summary"),
  childSession: $("#btn-child-session"),
  cloneSession: $("#btn-clone-session"),
  modalSessionTools: $("#modal-session-tools"),
  sessionToolsClose: $("#btn-session-tools-close"),
  sessionNameInput: $("#session-name-input"),
  sessionRename: $("#btn-session-rename"),
  steeringMode: $("#steering-mode"),
  followUpMode: $("#follow-up-mode"),
  autoCompaction: $("#auto-compaction"),
  autoRetry: $("#auto-retry"),
  compactInstructions: $("#compact-instructions"),
  compactBtn: $("#btn-compact"),
  copyLast: $("#btn-copy-last"),
  exportHtml: $("#btn-export-html"),
  abortRetry: $("#btn-abort-retry"),
  modalAuth: $("#modal-auth"),
  authTitle: $("#auth-title"),
  authSubtitle: $("#auth-subtitle"),
  authStatus: $("#auth-status"),
  authOptions: $("#auth-options"),
  authInputWrap: $("#auth-input-wrap"),
  authInputLabel: $("#auth-input-label"),
  authInput: $("#auth-input"),
  authCancel: $("#btn-auth-cancel"),
  authOk: $("#btn-auth-ok"),
  toasts: $("#toasts"),
  sidebarResizer: $("#sidebar-resizer"),
  chatTooltip: $("#chat-tooltip"),
  searchClear: $("#search-clear"),
  globalSearch: document.querySelector(".global-search"),
};

const state = {
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
  // streaming assembly
  streamAssistant: null, // {container, blocks:Map, buffers:Map}
  tools: new Map(), // toolCallId -> {card, outEl, stateEl}
  modelsCache: null,
  modelsCacheAt: 0,
  currentModel: null,
  thinkingLevels: [],
  steerHintShown: false,
  commands: [],
  commandSelection: 0,
  slashSelection: 0,
  commandsLoading: null,
  commandUsage: (() => {
    try { return JSON.parse(localStorage.getItem("pi-desktop-command-usage") || "{}"); }
    catch { return {}; }
  })(),
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

function relTime(ms) {
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

function fmtCost(c) {
  if (!c && c !== 0) return "";
  if (c >= 1) return `$${c.toFixed(2)}`;
  return `$${c.toFixed(4)}`;
}

function fmtTokens(n) {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function basename(p) {
  if (!p) return "";
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
}

function scrollBottom(force = false) {
  const near = el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight < 160;
  if (near || force) el.chat.scrollTop = el.chat.scrollHeight;
}

function jumpToBottom() {
  const previous = el.chat.style.scrollBehavior;
  el.chat.style.scrollBehavior = "auto";
  el.chat.scrollTop = el.chat.scrollHeight;
  requestAnimationFrame(() => { el.chat.style.scrollBehavior = previous; });
}

let renderQueued = false;
function scheduleScroll() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    scrollBottom();
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

function renderAttachmentTray() {
  el.attachmentTray.innerHTML = "";
  el.attachmentTray.classList.toggle("hidden", !state.attachments.length);
  state.attachments.forEach((attachment, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    const preview = attachment.data
      ? `<img src="data:${escapeHtml(attachment.mimeType)};base64,${attachment.data}" alt="" />`
      : icon("file");
    chip.innerHTML = `${preview}<span class="attachment-name"></span><span class="attachment-size">${formatBytes(attachment.size)}</span>` +
      `<button title="${t("attachment.remove")}" aria-label="${t("attachment.remove")}">${icon("x")}</button>`;
    chip.querySelector(".attachment-name").textContent = attachment.name;
    chip.querySelector("button").addEventListener("click", () => {
      state.attachments.splice(index, 1);
      renderAttachmentTray();
    });
    el.attachmentTray.appendChild(chip);
  });
  refreshIcons();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function pickAttachments(kind) {
  try {
    const picked = await api.pickFiles(kind);
    for (const attachment of picked) {
      if (!state.attachments.some((candidate) => candidate.path === attachment.path)) state.attachments.push(attachment);
    }
    if (state.attachments.length > 12) {
      state.attachments.length = 12;
      toast(t("toast.attachLimit"), "warn");
    }
    renderAttachmentTray();
    el.input.focus();
  } catch (err) {
    toast(t("toast.attachError", {msg: err.message}), "error");
  }
}

function clipboardImageExtension(mimeType) {
  return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[mimeType] || "png";
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function pasteClipboardImages(event) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItems = items.filter((item) => item.kind === "file" && item.type.startsWith("image/"));
  if (!imageItems.length) return;
  event.preventDefault();

  const text = event.clipboardData?.getData("text/plain") || "";
  if (text) {
    const start = el.input.selectionStart;
    const end = el.input.selectionEnd;
    el.input.setRangeText(text, start, end, "end");
  }
  let added = 0;
  for (const item of imageItems) {
    if (state.attachments.length >= 12) break;
    const file = item.getAsFile();
    if (!file || file.size > 15 * 1024 * 1024) {
      toast("Immagine incollata oltre il limite di 15 MB.", "warn");
      continue;
    }
    const currentBytes = state.attachments.reduce((sum, attachment) => sum + (attachment.size || 0), 0);
    if (currentBytes + file.size > 40 * 1024 * 1024) {
      toast("Le immagini superano complessivamente 40 MB.", "warn");
      continue;
    }
    const mimeType = item.type.toLowerCase();
    state.attachments.push({
      name: `clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.${clipboardImageExtension(mimeType)}`,
      path: null,
      size: file.size,
      mimeType,
      data: bufferToBase64(await file.arrayBuffer()),
    });
    added += 1;
  }
  renderAttachmentTray();
  autosize();
  if (added) toast(`${added} immagine${added === 1 ? "" : "i"} incollata${added === 1 ? "" : "e"}.`, "info", 2400);
}

function insertCodeBlock() {
  const start = el.input.selectionStart;
  const end = el.input.selectionEnd;
  const selected = el.input.value.slice(start, end);
  const fence = "```";
  const inserted = selected ? `${fence}\n${selected}\n${fence}` : `${fence}\n\n${fence}`;
  el.input.setRangeText(inserted, start, end, "end");
  if (!selected) el.input.setSelectionRange(start + 4, start + 4);
  autosize();
  el.input.focus();
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
function renderFinalMessage(message, resultMap) {
  el.emptyState.classList.add("hidden");
  setConversationMode(true);

  if (message.role === "user") {
    const blocks = Array.isArray(message.content) ? message.content : [];
    const images = blocks.filter((block) => block?.type === "image").map((block, index) => ({
      ...block,
      name: `Immagine ${index + 1}`,
    }));
    addUserMessage(
      typeof message.content === "string" ? message.content : textOfBlocks(message.content),
      images,
      { timestamp: message.timestamp, status: "historical" }
    );
    return;
  }
  if (message.role === "bashExecution") {
    const card = makeToolCard("bash", message.command);
    setToolCardResult(card, `${message.command}\n\n${message.output || ""}`, message.exitCode ? true : false);
    bundleActivityMessages();
    return;
  }
  if (message.role === "custom") {
    const div = document.createElement("div");
    div.className = "msg-assistant";
    div.innerHTML = `<div class="content md"></div>`;
    div.querySelector(".content").innerHTML = md(textOfBlocks(message.content));
    el.messages.appendChild(div);
    return;
  }
  if (message.role === "branchSummary" || message.role === "compactionSummary") {
    const det = document.createElement("details");
    det.className = "think";
    det.innerHTML = `<summary>riepilogo automatico</summary><div class="think-body"></div>`;
    det.querySelector(".think-body").textContent = message.summary || "";
    el.messages.appendChild(det);
    return;
  }
  if (message.role === "toolResult") {
    // Attached to its tool call card when that comes later in the stream.
    const callId = message.toolCallId;
    if (resultMap && resultMap.results?.has(callId) && !resultMap.consumed?.has(callId)) {
      return; // will be rendered inside the assistant's tool card
    }
    const card = makeToolCard(message.toolName || "tool", "");
    setToolCardResult(card, textOfBlocks(message.content), Boolean(message.isError), message.content);
    bundleActivityMessages();
    return;
  }
  if (message.role === "assistant") {
    const blocks = message.content || [];
    const hasVisibleContent = hasVisibleAssistantContent(blocks);
    if (!hasVisibleContent && message.stopReason !== "error") return;
    const wrap = document.createElement("div");
    wrap.className = `msg-assistant${isActivityOnly(blocks) ? " activity-only" : ""}`;
    const tag = document.createElement("div");
    tag.className = "role-tag";
    const meta = [];
    if (message.model) meta.push(message.model);
    if (message.usage?.cost?.total != null) meta.push(fmtCost(message.usage.cost.total));
    tag.textContent = `pi${meta.length ? " · " + meta.join(" · ") : ""}`;
    wrap.appendChild(tag);
    const content = document.createElement("div");
    content.className = "content";
    renderContentBlocks(content, blocks, resultMap);
    wrap.appendChild(content);
    if (message.stopReason === "error") {
      const err = document.createElement("div");
      err.className = "error-box";
      err.textContent = message.errorMessage || t("error.unknown");
      wrap.appendChild(err);
    }
    el.messages.appendChild(wrap);
    bundleActivityMessages();
  }
}

function isActivityOnly(blocks) {
  const items = Array.isArray(blocks) ? blocks : [];
  const hasActivity = items.some((block) => block?.type === "toolCall" || block?.type === "thinking");
  const hasAnswer = items.some((block) =>
    block?.type === "image" || (block?.type === "text" && Boolean(block.text?.trim()))
  );
  return hasActivity && !hasAnswer;
}

function toolIconName(toolName) {
  const name = String(toolName || "").toLowerCase();
  if (name === "read") return "book-open";
  if (["edit", "write"].includes(name)) return "pencil";
  if (["grep", "find", "search"].includes(name)) return "search";
  if (["bash", "shell", "powershell"].some((value) => name.startsWith(value))) return "terminal";
  if (name === "ls") return "folder-open";
  return "wrench";
}

function toolDisplayName(toolName) {
  const name = String(toolName || "tool").toLowerCase();
  if (name === "read") return t("tool.display.read");
  if (["edit", "write"].includes(name)) return t("tool.display.edit");
  if (["grep", "find", "search"].includes(name)) return t("tool.display.search");
  if (name === "ls") return t("tool.display.ls");
  if (["bash", "shell", "powershell"].some((value) => name.startsWith(value))) return t("tool.display.bash");
  return toolName || t("tool.display.tool");
}

function activityBundleLabel(bundle) {
  const tools = [...bundle.querySelectorAll(".tool-card")].map((card) => card.dataset.tool);
  const counts = (names) => tools.filter((tool) => names.includes(tool)).length;
  const edits = counts(["edit", "write"]);
  const reads = counts(["read"]);
  const searches = counts(["grep", "find", "search"]);
  const shells = tools.filter((tool) => tool?.startsWith("bash") || tool === "shell" || tool === "powershell").length;
  const parts = [];
  if (edits) parts.push(edits === 1 ? "ha modificato un file" : `ha modificato ${edits} file`);
  if (reads) parts.push(reads === 1 ? "ha letto un file" : `ha letto ${reads} file`);
  if (searches) parts.push(searches === 1 ? "ha effettuato una ricerca" : `ha effettuato ${searches} ricerche`);
  if (shells) parts.push(shells === 1 ? "ha eseguito un comando" : `ha eseguito ${shells} comandi`);
  const label = parts.length ? parts.join(" e ") : "ha elaborato il contesto";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function updateActivityBundle(bundle) {
  const count = bundle.querySelectorAll(".tool-card, details.think").length;
  bundle.querySelector(".activity-label").textContent = activityBundleLabel(bundle);
  bundle.querySelector(".activity-count").textContent = count ? `${count} attività` : "";
}

function bundleActivityMessages() {
  // Normalize every activity-only assistant shell and every existing bundle
  // to the same flat list before regrouping. This prevents one tool result
  // (especially bash) from alternating between a bundle and a standalone card.
  for (const bundle of [...el.messages.querySelectorAll(":scope > .activity-bundle")]) {
    const list = bundle.querySelector(".activity-list");
    for (const child of [...(list?.children || [])]) bundle.before(child);
    bundle.remove();
  }
  for (const wrap of [...el.messages.querySelectorAll(":scope > .msg-assistant.activity-only")]) {
    const content = wrap.querySelector(":scope > .content");
    for (const child of [...(content?.children || [])]) wrap.before(child);
    wrap.remove();
  }

  let bundle = null;
  for (const node of [...el.messages.children]) {
    const activity = node.classList.contains("tool-card") || node.matches("details.think");
    if (!activity) {
      bundle = null;
      continue;
    }
    if (!bundle) {
      bundle = document.createElement("details");
      bundle.className = "activity-bundle";
      bundle.open = true;
      bundle.innerHTML = `<summary>${icon("paperclip")}<span class="activity-label">Attività</span><span class="activity-count"></span></summary><div class="activity-list"></div>`;
      el.messages.insertBefore(bundle, node);
    }
    bundle.querySelector(".activity-list").appendChild(node);
    updateActivityBundle(bundle);
  }
  refreshIcons();
}

function textOfBlocks(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Render assistant content blocks (text/thinking/toolCall) into a container. */
function renderContentBlocks(container, blocks, resultMap) {
  for (const block of blocks) {
    if (block.type === "text") {
      const div = document.createElement("div");
      div.className = "md";
      div.innerHTML = md(block.text || "");
      container.appendChild(div);
    } else if (block.type === "thinking") {
      if (!String(block.thinking || "").trim()) continue;
      const det = document.createElement("details");
      det.className = "think";
      det.innerHTML = `<summary>Ragionamento</summary><div class="think-body"></div>`;
      det.querySelector(".think-body").textContent = block.thinking || "";
      container.appendChild(det);
    } else if (block.type === "toolCall") {
      const toolName = block.name || block.toolName || "tool";
      const card = makeToolCard(toolName, compactToolArgs(toolName, block.arguments), container);
      const callId = block.id || block.toolCallId;
      const res = resultMap?.results?.get(callId);
      if (res && !resultMap.consumed.has(callId)) {
        resultMap.consumed.add(callId);
        setToolCardResult(card, textOfBlocks(res.content), Boolean(res.isError), res.content);
      }
    } else if (block.type === "image") {
      renderMediaBlock(container, block, "Immagine generata");
    }
  }
}

// ---------------------------------------------------------------------------
// Streaming assembly
// ---------------------------------------------------------------------------

function beginStreamAssistant() {
  el.emptyState.classList.add("hidden");
  const wrap = document.createElement("div");
  wrap.className = "msg-assistant activity-only";
  wrap.innerHTML = `<div class="role-tag">pi</div><div class="content"></div>`;
  // Keep the shell detached until the first real block arrives. Pi can emit
  // empty assistant segments between internal steps; mounting those shells was
  // the source of repeated, content-less “PI” labels.
  state.streamAssistant = { wrap, content: wrap.querySelector(".content"), blocks: new Map(), rafPending: false, mounted: false };
  state.lastAssistantErrored = false;
}

function mountStreamAssistant() {
  const sa = state.streamAssistant;
  if (!sa || sa.mounted) return;
  el.messages.appendChild(sa.wrap);
  sa.mounted = true;
  scheduleScroll();
}

function streamEnsureBlock(idx, type) {
  const sa = state.streamAssistant;
  if (!sa) return null;
  if (!sa.blocks.has(idx)) {
    mountStreamAssistant();
    let node;
    if (type === "text") {
      node = document.createElement("div");
      node.className = "md typing";
      node.dataset.raw = "";
      sa.content.appendChild(node);
    } else if (type === "thinking") {
      node = document.createElement("details");
      node.className = "think";
      node.innerHTML = `<summary>Ragionamento</summary><div class="think-body"></div>`;
      sa.content.appendChild(node);
    } else if (type === "toolcall") {
      node = makeToolCard("…", "", sa.content);
      node.dataset.args = "";
    }
    sa.blocks.set(idx, { type, node });
  }
  return sa.blocks.get(idx);
}

function streamApplyDelta(evt) {
  const sa = state.streamAssistant;
  if (!sa) return;
  const e = evt.assistantMessageEvent;
  if (!e) return;
  const idx = e.contentIndex;

  if (e.type === "text_delta") {
    if (!e.delta && !sa.blocks.has(idx)) return;
    const b = streamEnsureBlock(idx, "text");
    if (e.delta?.trim()) sa.wrap.classList.remove("activity-only");
    b.node.dataset.raw += e.delta || "";
    queueStreamRender(b.node);
  } else if (e.type === "thinking_delta") {
    if (!e.delta && !sa.blocks.has(idx)) return;
    const b = streamEnsureBlock(idx, "thinking");
    b.node.querySelector(".think-body").textContent += e.delta || "";
    scheduleScroll();
  } else if (e.type === "toolcall_start") {
    const b = streamEnsureBlock(idx, "toolcall");
    const toolName = e.toolName || "…";
    b.node.dataset.tool = toolName.toLowerCase();
    b.node.querySelector(".tool-name").innerHTML = `${icon(toolIconName(toolName))} ${escapeHtml(toolDisplayName(toolName))}`;
    if (e.id) state.tools.set(e.id, b.node);
    refreshIcons();
  } else if (e.type === "toolcall_delta") {
    const b = streamEnsureBlock(idx, "toolcall");
    b.node.dataset.args = (b.node.dataset.args || "") + (e.delta || "");
  } else if (e.type === "toolcall_end") {
    const tc = e.toolCall || {};
    const b = streamEnsureBlock(idx, "toolcall");
    const toolName = tc.name || "…";
    b.node.dataset.tool = toolName.toLowerCase();
    b.node.querySelector(".tool-name").innerHTML = `${icon(toolIconName(toolName))} ${escapeHtml(toolDisplayName(toolName))}`;
    if (tc.id || tc.toolCallId) state.tools.set(tc.id || tc.toolCallId, b.node);
    const argsEl = b.node.querySelector(".tool-args");
    argsEl.textContent = compactToolArgs(toolName, tc.arguments);
    argsEl.title = fullToolArgs(tc.arguments);
    refreshIcons();
  } else if (e.type === "text_end") {
    const b = sa.blocks.get(idx);
    if (b && b.type === "text") {
      b.node.dataset.raw = e.content ?? b.node.dataset.raw;
      renderStreamTextNode(b.node);
    }
  }
}

function renderStreamTextNode(node) {
  node.innerHTML = md(node.dataset.raw || "");
  node.classList.remove("typing");
  scheduleScroll();
}

function queueStreamRender(node) {
  const sa = state.streamAssistant;
  if (!sa || sa.rafPending) return;
  sa.rafPending = true;
  requestAnimationFrame(() => {
    sa.rafPending = false;
    if (node.isConnected) renderStreamTextNode(node);
  });
}

function endStreamAssistant(message) {
  const sa = state.streamAssistant;
  if (!sa) return;
  const blocks = message?.content || [];
  sa.wrap.classList.toggle("activity-only", isActivityOnly(blocks));
  const hasVisibleContent = hasVisibleAssistantContent(blocks);
  if (hasVisibleContent || message?.stopReason === "error") mountStreamAssistant();
  // Reconcile streamed nodes with the authoritative final message without
  // recreating tool cards that are already receiving execution events.
  for (const [idx, block] of blocks.entries()) {
    if (block.type === "text") {
      const streamed = streamEnsureBlock(idx, "text");
      streamed.node.dataset.raw = block.text || "";
      renderStreamTextNode(streamed.node);
    } else if (block.type === "thinking") {
      const thinking = String(block.thinking || "");
      const existing = sa.blocks.get(idx);
      if (!thinking.trim()) {
        existing?.node?.remove();
        sa.blocks.delete(idx);
        continue;
      }
      const streamed = streamEnsureBlock(idx, "thinking");
      streamed.node.open = false;
      streamed.node.querySelector(".think-body").textContent = thinking;
    } else if (block.type === "toolCall") {
      const streamed = streamEnsureBlock(idx, "toolcall");
      const callId = block.id || block.toolCallId;
      const toolName = block.name || block.toolName || "tool";
      streamed.node.dataset.tool = toolName.toLowerCase();
      streamed.node.querySelector(".tool-name").innerHTML = `${icon(toolIconName(toolName))} ${escapeHtml(toolDisplayName(toolName))}`;
      const argsEl = streamed.node.querySelector(".tool-args");
      argsEl.textContent = compactToolArgs(toolName, block.arguments);
      argsEl.title = fullToolArgs(block.arguments);
      if (callId) state.tools.set(callId, streamed.node);
    } else if (block.type === "image" && !sa.blocks.has(idx)) {
      const node = renderMediaBlock(sa.content, block, "Immagine generata");
      if (node) sa.blocks.set(idx, { type: "image", node });
    }
  }
  if (message?.stopReason === "error" && !sa.wrap.querySelector(".error-box")) {
    const err = document.createElement("div");
    err.className = "error-box";
    err.textContent = message.errorMessage || t("error.unknown");
    sa.wrap.appendChild(err);
  }
  state.lastAssistantErrored = message?.stopReason === "error";
  state.lastAssistantErrorWrap = state.lastAssistantErrored ? sa.wrap : null;
  state.streamAssistant = null;
  bundleActivityMessages();
  refreshIcons();
}

// ---------------------------------------------------------------------------
// Session history sidebar
// ---------------------------------------------------------------------------

function tabDisplayTitle(tab) {
  const session = tab.sessionFile && state.sessions.find((candidate) => candidate.file === tab.sessionFile);
  if (session) return session.hasName ? session.name : truncate(session.preview || t("session.newChat"), 70);
  return tab.title || t("session.newChat");
}

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

function configuredProjects() {
  const values = Array.isArray(state.settings?.projects) ? state.settings.projects : [state.settings?.cwd];
  return [...new Set(values.filter(Boolean))];
}

function sessionsForProject(projectPath) {
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

// ---------------------------------------------------------------------------
// Sidebar resize + custom tooltip + search enhancement
// ---------------------------------------------------------------------------

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

function truncate(s, n) {
  return s && s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function preferenceLabel(preference) {
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

async function openCommandPalette() {
  el.commandSearch.value = "";
  el.commandList.innerHTML = `<div class="menu-empty">Caricamento comandi…</div>`;
  el.modalCommands.showModal();
  setTimeout(() => el.commandSearch.focus(), 40);
  try {
    await ensureCommands();
    state.commandSelection = 0;
    renderCommandPalette();
  } catch (err) {
    el.commandList.innerHTML = `<div class="menu-empty">${escapeHtml(err.message)}</div>`;
  }
}

async function ensureCommands(force = false) {
  if (!force && state.commands.length) return state.commands;
  if (!force && state.commandsLoading) return state.commandsLoading;
  state.commandsLoading = api.getCommands()
    .then((data) => {
      state.commands = data.commands || [];
      return state.commands;
    })
    .finally(() => { state.commandsLoading = null; });
  return state.commandsLoading;
}

function filteredCommands() {
  const query = el.commandSearch.value.toLowerCase().trim();
  return state.commands
    .filter((command) => !query || `${command.name} ${command.description || ""} ${command.source}`.toLowerCase().includes(query))
    .sort((a, b) => commandUsageScore(b.name) - commandUsageScore(a.name) || a.name.localeCompare(b.name));
}

function renderCommandPalette() {
  const commands = filteredCommands();
  state.commandSelection = Math.max(0, Math.min(state.commandSelection, commands.length - 1));
  el.commandList.innerHTML = "";
  if (!commands.length) {
    el.commandList.innerHTML = `<div class="menu-empty">Nessun comando disponibile.</div>`;
    return;
  }
  commands.forEach((command, index) => {
    const button = document.createElement("button");
    button.className = `command-item${index === state.commandSelection ? " active" : ""}`;
    button.innerHTML = `<span class="command-name">/${escapeHtml(command.name)}</span>` +
      `<span class="command-description">${escapeHtml(command.description || "Nessuna descrizione")}</span>` +
      `<span class="source-badge">${escapeHtml(command.source)}</span>`;
    button.addEventListener("click", () => chooseCommand(command));
    el.commandList.appendChild(button);
  });
}

function chooseCommand(command) {
  recordCommandUsage(command.name);
  const prefix = `/${command.name}`;
  el.input.value = `${prefix} `;
  autosize();
  el.modalCommands.close();
  el.input.focus();
  el.input.setSelectionRange(el.input.value.length, el.input.value.length);
}

function commandUsageScore(name) {
  const usage = state.commandUsage[name];
  if (!usage) return 0;
  const ageDays = Math.max(0, (Date.now() - (usage.lastUsed || 0)) / 86400000);
  return (usage.count || 0) * 100 + Math.max(0, 30 - ageDays);
}

function recordCommandUsage(name) {
  if (!name) return;
  const previous = state.commandUsage[name] || { count: 0, lastUsed: 0 };
  state.commandUsage[name] = { count: previous.count + 1, lastUsed: Date.now() };
  try { localStorage.setItem("pi-desktop-command-usage", JSON.stringify(state.commandUsage)); } catch {}
}

function currentSlashQuery() {
  const cursor = el.input.selectionStart;
  if (cursor !== el.input.selectionEnd) return null;
  const before = el.input.value.slice(0, cursor);
  const after = el.input.value.slice(cursor);
  const match = before.match(/^\/([^\s]*)$/);
  if (!match || (after && !/^\s*$/.test(after))) return null;
  return match[1].toLowerCase();
}

function slashMatches() {
  const query = currentSlashQuery();
  if (query == null) return [];
  return state.commands
    .filter((command) => !query || `${command.name} ${command.description || ""}`.toLowerCase().includes(query))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(query) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(query) ? 0 : 1;
      return aPrefix - bPrefix || commandUsageScore(b.name) - commandUsageScore(a.name) || a.name.localeCompare(b.name);
    })
    .slice(0, 12);
}

async function renderSlashSuggestions() {
  if (currentSlashQuery() == null) return hideSlashSuggestions();
  try { await ensureCommands(); } catch { return hideSlashSuggestions(); }
  const commands = slashMatches();
  state.slashSelection = Math.max(0, Math.min(state.slashSelection, commands.length - 1));
  el.slashSuggestions.innerHTML = "";
  if (!commands.length) return hideSlashSuggestions();
  commands.forEach((command, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slash-suggestion${index === state.slashSelection ? " active" : ""}`;
    button.setAttribute("role", "option");
    button.innerHTML = `<span class="command-name">/${escapeHtml(command.name)}</span>` +
      `<span class="command-description">${escapeHtml(command.description || "")}</span>` +
      `<span class="source-badge">${escapeHtml(command.source)}</span>`;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applySlashSuggestion(command));
    el.slashSuggestions.appendChild(button);
  });
  el.slashSuggestions.classList.remove("hidden");
}

function hideSlashSuggestions() {
  el.slashSuggestions.classList.add("hidden");
  el.slashSuggestions.innerHTML = "";
}

function applySlashSuggestion(command) {
  recordCommandUsage(command.name);
  const cursor = el.input.selectionStart;
  const suffix = el.input.value.slice(cursor).replace(/^\s*/, "");
  el.input.value = `/${command.name} ${suffix}`;
  const position = command.name.length + 2;
  el.input.setSelectionRange(position, position);
  hideSlashSuggestions();
  autosize();
  el.input.focus();
}

// ---------------------------------------------------------------------------
// Session tree, fork and clone
// ---------------------------------------------------------------------------

function treeEntryDescription(entry) {
  if (!entry) return { role: "voce", text: "" };
  if (entry.type === "message") {
    const role = entry.message?.role || "messaggio";
    return { role, text: truncate(textOfBlocks(entry.message?.content).replace(/\s+/g, " ").trim(), 180) || `[${role}]` };
  }
  if (entry.type === "compaction") return { role: "compact", text: truncate(entry.summary || "Compattazione del contesto", 180) };
  if (entry.type === "branch_summary") return { role: "riepilogo", text: truncate(entry.summary || "Riepilogo ramo", 180) };
  if (entry.type === "session_info") return { role: "sessione", text: entry.name || "Informazioni sessione" };
  if (entry.type === "model_change") return { role: "modello", text: `${entry.provider || ""}/${entry.modelId || ""}` };
  if (entry.type === "thinking_level_change") return { role: "thinking", text: entry.thinkingLevel || "" };
  return { role: entry.type || "voce", text: entry.label || entry.type || "Voce sessione" };
}

function flattenTree(nodes, depth = 0, output = []) {
  for (const node of nodes || []) {
    output.push({ node, depth });
    flattenTree(node.children, depth + 1, output);
  }
  return output;
}

async function loadSessionTree() {
  el.treeList.innerHTML = `<div class="menu-empty">Caricamento albero…</div>`;
  try {
    const [data, forkData] = await Promise.all([api.getTree(), api.getForkMessages()]);
    const forkIds = new Set((forkData.messages || []).map((message) => message.entryId));
    const flat = flattenTree(data.tree || []);
    el.treeSummary.textContent = `${flat.length} voci · ${forkIds.size} punti di fork`;
    el.treeList.innerHTML = "";
    if (!flat.length) {
      el.treeList.innerHTML = `<div class="menu-empty">La sessione è ancora vuota.</div>`;
      return;
    }
    for (const { node, depth } of flat) {
      const entry = node.entry || {};
      const description = treeEntryDescription(entry);
      const row = document.createElement("div");
      row.className = `tree-node${entry.id === data.leafId ? " active" : ""}`;
      row.style.paddingLeft = `${10 + depth * 18}px`;
      row.innerHTML = `${depth ? '<span class="tree-rail"></span>' : ""}` +
        `<span class="tree-role">${escapeHtml(description.role)}</span>` +
        `<span class="tree-text"></span><span class="tree-id">${escapeHtml(String(entry.id || "").slice(0, 8))}</span>`;
      row.querySelector(".tree-text").textContent = node.label || description.text;
      if (forkIds.has(entry.id)) {
        const forkButton = document.createElement("button");
        forkButton.className = "btn ghost tree-fork";
        forkButton.innerHTML = `${icon("git-fork")} Fork`;
        forkButton.addEventListener("click", () => forkFromEntry(entry.id));
        row.appendChild(forkButton);
      }
      el.treeList.appendChild(row);
    }
    refreshIcons();
  } catch (err) {
    el.treeList.innerHTML = `<div class="menu-empty">Albero non disponibile.<br><span class="small">${escapeHtml(err.message)}</span></div>`;
  }
}

async function openSessionTree() {
  el.modalTree.showModal();
  await loadSessionTree();
}

async function forkFromEntry(entryId) {
  try {
    const result = await api.fork(entryId);
    if (result.cancelled) return toast("Fork annullato da un’estensione.", "warn");
    el.modalTree.close();
    await reloadConversationFromRuntime();
    el.input.value = result.text || "";
    autosize();
    el.input.focus();
    toast("Nuovo fork creato. Puoi modificare il prompt originale.");
  } catch (err) {
    toast(`Fork fallito: ${err.message}`, "error");
  }
}

async function cloneActiveSession() {
  try {
    const result = await api.clone();
    if (result.cancelled) return toast("Clonazione annullata da un’estensione.", "warn");
    el.modalTree.close();
    await reloadConversationFromRuntime();
    toast("Ramo attivo clonato in una nuova sessione.");
  } catch (err) {
    toast(`Clonazione fallita: ${err.message}`, "error");
  }
}

async function newChildSession() {
  try {
    const current = await api.getState();
    const parentSession = current.sessionFile || state.activeSessionFile;
    if (!parentSession) return toast("Invia almeno un messaggio prima di creare una sessione figlia.", "warn");
    el.modalTree.close();
    await newChat(state.settings?.cwd, parentSession);
    toast("Nuova sessione collegata alla sessione precedente.");
  } catch (err) {
    toast(`Creazione sessione figlia fallita: ${err.message}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Session actions and runtime controls
// ---------------------------------------------------------------------------

async function openSessionTools() {
  try {
    const current = await api.getState();
    el.sessionNameInput.value = current.sessionName || "";
    el.steeringMode.value = current.steeringMode || "one-at-a-time";
    el.followUpMode.value = current.followUpMode || "one-at-a-time";
    el.autoCompaction.checked = current.autoCompactionEnabled !== false;
    el.autoRetry.checked = state.autoRetryEnabled;
    el.modalSessionTools.showModal();
  } catch (err) {
    toast(`Stato sessione non disponibile: ${err.message}`, "error");
  }
}

async function renameSession() {
  try {
    await api.setSessionName(el.sessionNameInput.value.trim());
    await refreshSessions();
    toast("Nome sessione aggiornato.");
  } catch (err) {
    toast(`Rinomina fallita: ${err.message}`, "error");
  }
}

async function compactSession() {
  el.compactBtn.disabled = true;
  try {
    const result = await api.compact(el.compactInstructions.value.trim() || undefined);
    const before = result.tokensBefore != null ? fmtTokens(result.tokensBefore) : "?";
    const after = result.estimatedTokensAfter != null ? fmtTokens(result.estimatedTokensAfter) : "?";
    toast(`Contesto compattato: ${before} → circa ${after} token.`, "info", 6500);
    await reloadConversationFromRuntime();
  } catch (err) {
    toast(`Compattazione fallita: ${err.message}`, "error", 8000);
  } finally {
    el.compactBtn.disabled = false;
  }
}

async function newChat(projectPath = state.settings?.cwd, parentSession = null) {
  if (state.creatingChat) return;
  stashActiveTabContext();
  state.creatingChat = true;
  document.body.classList.add("session-loading");
  el.newChat?.setAttribute("disabled", "true");
  el.topNewChat?.setAttribute("disabled", "true");
  try {
    resetQueueState();
    setBusy(false);
    clearChat();
    setConversationMode(false);
    state.attachments = [];
    renderAttachmentTray();
    if (projectPath && projectPath !== state.settings?.cwd) {
      state.settings = await api.activateProject(projectPath);
    }
    if (projectPath) state.expandedProjects.add(projectPath);
    const created = await api.newSession(projectPath, parentSession);
    state.commands = [];
    state.activeTabId = created.tabId || state.activeTabId;
    state.activeSessionFile = null;
    state.tabContexts.set(state.activeTabId, { input: "", attachments: [], queueBehavior: "followUp", localQueue: [] });
    el.emptyState.classList.remove("hidden");
    el.statusCwd.textContent = projectPath || state.settings?.cwd || "";
    await refreshTabs();
    renderProjects();
    refreshHeaderFromState();
    el.input.focus();
  } catch (err) {
    toast(`Nuova chat non riuscita: ${err.message}`, "error");
  } finally {
    state.creatingChat = false;
    document.body.classList.remove("session-loading");
    el.newChat?.removeAttribute("disabled");
    el.topNewChat?.removeAttribute("disabled");
    renderProjects();
  }
}

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

async function refreshStats() {
  try {
    const st = await api.getSessionStats();
    const bits = [];
    if (st.tokens?.total) bits.push(`${fmtTokens(st.tokens.total)} tok`);
    if (typeof st.cost === "number") bits.push(fmtCost(st.cost));
    if (st.contextUsage) bits.push(`ctx ${st.contextUsage.percent}%`);
    el.statusTokens.textContent = bits.join(" · ");
  } catch {}
}

function setBusy(busy, { dispatchQueue = true } = {}) {
  state.busy = busy;
  el.sendBtn.classList.remove("hidden");
  el.stopBtn.classList.toggle("hidden", !busy);
  el.busySendChoice.classList.toggle("hidden", !busy);
  const forceButton = [...el.queueBehaviorButtons].find((button) => button.dataset.queueBehavior === "steer");
  if (forceButton) forceButton.disabled = Boolean(busy && state.directBashRunning);
  el.sendBtn.title = busy
    ? state.queueBehavior === "steer" ? "Forza nella coda di Pi" : "Accoda senza forzare"
    : "Invia";
  el.statusActivity.textContent = busy ? "agente al lavoro…" : "";
  if (!busy && dispatchQueue && !state.queueDispatchPaused && state.localQueue.length && !state.dispatchingLocalQueue) {
    queueMicrotask(dispatchNextLocalMessage);
  }
}

function cancelQueuedMessagesForStop() {
  const queuedWraps = new Set([
    ...state.localQueue.map((item) => item.userMessage),
    ...state.queuedUserMessages.map((item) => item.userMessage),
  ]);
  for (const wrap of queuedWraps) setUserMessageStatus(wrap, "interrupted");
  state.localQueue = [];
  state.queuedUserMessages = [];
  state.nativeQueue = { steering: [], followUp: [] };
  renderQueuePanel();
}

function finishInterruptedRendering() {
  if (state.streamAssistant) {
    const stream = state.streamAssistant;
    for (const block of stream.blocks.values()) block.node?.classList?.remove("typing");
    if (stream.mounted && !stream.wrap.querySelector(".error-box")) {
      const notice = document.createElement("div");
      notice.className = "error-box interrupted";
      notice.textContent = "Generazione interrotta.";
      stream.wrap.appendChild(notice);
    }
    state.streamAssistant = null;
  }
  for (const card of state.tools.values()) {
    const status = card.querySelector(".tool-state");
    if (status) {
      status.textContent = "interrotto";
      status.className = "tool-state interrupted";
    }
  }
  state.tools.clear();
}

async function abortCurrentWork() {
  if (state.stopInProgress || !state.busy) return;
  state.stopInProgress = true;
  state.queueDispatchPaused = true;
  el.stopBtn.disabled = true;
  el.statusActivity.textContent = "interruzione in corso…";
  const hadNativeQueue = Boolean(
    state.nativeQueue.steering.length || state.nativeQueue.followUp.length || state.queuedUserMessages.length
  );
  cancelQueuedMessagesForStop();
  const isDirectBash = state.directBashRunning;
  const action = isDirectBash ? api.abortBash() : api.abort();
  api.abortRetry().catch(() => {});
  try {
    const graceful = await Promise.race([
      action.then(() => true).catch(() => false),
      new Promise((resolve) => setTimeout(() => resolve(false), hadNativeQueue ? 700 : 3200)),
    ]);
    if (!graceful || hadNativeQueue) {
      el.statusActivity.textContent = "arresto forzato e ripristino sessione…";
      await api.forceStop();
      toast("Pi non rispondeva: runtime arrestato e sessione ripristinata.", "warn", 6500);
    }
  } catch (err) {
    toast(`Arresto forzato non riuscito: ${err.message}`, "error", 8000);
  } finally {
    setUserMessageStatus(state.activeUserMessage, "interrupted");
    state.activeUserMessage = null;
    state.directBashRunning = false;
    state.directBashCard = null;
    finishInterruptedRendering();
    state.stopInProgress = false;
    state.queueDispatchPaused = false;
    el.stopBtn.disabled = false;
    setBusy(false, { dispatchQueue: false });
    refreshSessionsSoon();
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function clearComposerAfterQueue() {
  el.input.value = "";
  state.attachments = [];
  renderAttachmentTray();
  autosize();
}

function renderQueuePanel() {
  const nativeSteering = state.nativeQueue.steering || [];
  const nativeFollowUp = state.nativeQueue.followUp || [];
  const total = state.localQueue.length + nativeSteering.length + nativeFollowUp.length;
  el.queuedNote.classList.toggle("hidden", total === 0);
  if (!total) {
    el.queuedNote.innerHTML = "";
    return;
  }
  el.queuedNote.innerHTML = `<div class="queue-panel-head">${icon("list-ordered")}<strong>Coda messaggi</strong><span class="muted">${total}</span></div>`;
  for (const item of state.localQueue) {
    const row = document.createElement("div");
    row.className = "queue-row";
    row.innerHTML = `<span class="queue-badge wait">dopo</span><span class="queue-text"></span>`;
    row.querySelector(".queue-text").textContent = item.displayText;
    row.querySelector(".queue-text").title = item.displayText;
    const edit = document.createElement("button");
    edit.className = "queue-action";
    edit.textContent = "Modifica";
    edit.addEventListener("click", () => editLocalMessage(item.id, row));
    const force = document.createElement("button");
    force.className = "queue-action force";
    force.textContent = "Forza";
    force.disabled = state.directBashRunning;
    force.addEventListener("click", () => forceLocalMessage(item.id));
    const remove = document.createElement("button");
    remove.className = "queue-action";
    remove.textContent = "Rimuovi";
    remove.addEventListener("click", () => removeLocalMessage(item.id));
    row.append(edit, force, remove);
    el.queuedNote.appendChild(row);
  }
  const appendNative = (text, forced) => {
    const row = document.createElement("div");
    row.className = "queue-row";
    row.innerHTML = `<span class="queue-badge ${forced ? "force" : "wait"}">${forced ? "forzato" : "dopo"}</span><span class="queue-text"></span><span class="muted small">già inviato a Pi</span>`;
    row.querySelector(".queue-text").textContent = text;
    row.querySelector(".queue-text").title = text;
    el.queuedNote.appendChild(row);
  };
  nativeSteering.forEach((text) => appendNative(text, true));
  nativeFollowUp.forEach((text) => appendNative(text, false));
  refreshIcons();
}

function editLocalMessage(id, row) {
  const item = state.localQueue.find((candidate) => candidate.id === id);
  if (!item) return;
  row.classList.add("editing");
  row.innerHTML = `<span class="queue-badge wait">dopo</span><input class="queue-edit-input" type="text" maxlength="20000" aria-label="Modifica messaggio in coda" />`;
  const input = row.querySelector(".queue-edit-input");
  input.value = item.displayText;
  const save = document.createElement("button");
  save.className = "queue-action force";
  save.textContent = "Salva";
  const cancel = document.createElement("button");
  cancel.className = "queue-action";
  cancel.textContent = "Annulla";
  const commit = () => {
    const value = input.value.trim();
    if (!value) return toast("Il messaggio in coda non può essere vuoto.", "warn");
    item.displayText = value;
    item.message = `${value}${item.messageSuffix || ""}`;
    const bubble = item.userMessage?.querySelector(".bubble");
    if (bubble) bubble.textContent = value;
    renderQueuePanel();
    toast("Messaggio in coda aggiornato.");
  };
  save.addEventListener("click", commit);
  cancel.addEventListener("click", renderQueuePanel);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      renderQueuePanel();
    }
  });
  row.append(save, cancel);
  input.focus();
  input.select();
}

function removeLocalMessage(id) {
  const index = state.localQueue.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = state.localQueue.splice(index, 1);
  item.userMessage?.remove();
  renderQueuePanel();
  toast("Messaggio rimosso dalla coda.");
}

async function deliverQueuedItem(item, force = false) {
  setUserMessageStatus(item.userMessage, "sending");
  let tracking = null;
  try {
    if (state.busy) {
      if (!force) {
        setUserMessageStatus(item.userMessage, "localQueued");
        return false;
      }
      tracking = { message: item.message, userMessage: item.userMessage };
      state.queuedUserMessages.push(tracking);
      await api.steer(item.message, item.images.length ? item.images : undefined);
      setUserMessageStatus(item.userMessage, "queued");
    } else {
      state.activeUserMessage = item.userMessage;
      setBusy(true);
      await api.prompt(item.message, item.images.length ? item.images : undefined);
      setUserMessageStatus(item.userMessage, "received");
    }
    return true;
  } catch (err) {
    if (tracking) state.queuedUserMessages = state.queuedUserMessages.filter((entry) => entry !== tracking);
    setUserMessageStatus(item.userMessage, "localQueued");
    toast(`Invio dalla coda fallito: ${err.message}`, "error");
    return false;
  }
}

async function forceLocalMessage(id) {
  if (state.directBashRunning) return toast("Attendi la fine del comando shell prima di forzare.", "warn");
  const index = state.localQueue.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = state.localQueue.splice(index, 1);
  renderQueuePanel();
  const delivered = await deliverQueuedItem(item, true);
  if (!delivered) {
    state.localQueue.splice(index, 0, item);
    renderQueuePanel();
  }
}

async function dispatchNextLocalMessage() {
  if (state.busy || state.dispatchingLocalQueue || !state.localQueue.length) return;
  state.dispatchingLocalQueue = true;
  const item = state.localQueue.shift();
  renderQueuePanel();
  const delivered = await deliverQueuedItem(item, false);
  if (!delivered) {
    state.localQueue.unshift(item);
    renderQueuePanel();
  }
  state.dispatchingLocalQueue = false;
  if (!state.busy && state.localQueue.length) queueMicrotask(dispatchNextLocalMessage);
}

function resetQueueState() {
  state.localQueue = [];
  state.nativeQueue = { steering: [], followUp: [] };
  state.queuedUserMessages = [];
  state.dispatchingLocalQueue = false;
  renderQueuePanel();
}

async function sendMessage(rawBehavior) {
  const text = el.input.value.trim();
  const attachments = state.attachments.slice();
  if (!text && !attachments.length) return;
  if (!state.busy && !attachments.length && text.startsWith("!")) {
    const excludeFromContext = text.startsWith("!!");
    const command = text.slice(excludeFromContext ? 2 : 1).trim();
    if (!command) return;
    el.input.value = "";
    autosize();
    await runDirectBash(command, excludeFromContext);
    return;
  }
  const images = attachments
    .filter((attachment) => attachment.data && attachment.mimeType?.startsWith("image/"))
    .map((attachment) => ({ type: "image", data: attachment.data, mimeType: attachment.mimeType }));
  const files = attachments.filter((attachment) => !attachment.mimeType?.startsWith("image/"));
  const displayText = text || (images.length ? "Analizza queste immagini." : "Analizza gli allegati.");
  let message = displayText;
  if (files.length) {
    message += "\n\nAllegati locali selezionati dall’utente (usa gli strumenti disponibili per leggerli):\n" +
      files.map((file) => `- ${file.path}`).join("\n");
  }

  if (state.busy) {
    const behavior = state.directBashRunning ? "followUp" : rawBehavior || state.queueBehavior;
    const userMessage = addUserMessage(displayText, attachments, { timestamp: Date.now(), status: "sending" });
    clearComposerAfterQueue();
    if (behavior === "followUp") {
      state.localQueue.push({
        id: `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message,
        displayText,
        messageSuffix: message.slice(displayText.length),
        images,
        userMessage,
      });
      setUserMessageStatus(userMessage, "localQueued");
      renderQueuePanel();
      toast("Messaggio accodato senza forzare.");
      return;
    }
    const tracking = { message, userMessage };
    state.queuedUserMessages.push(tracking);
    try {
      await api.steer(message, images.length ? images : undefined);
      setUserMessageStatus(userMessage, "queued");
      toast("Istruzione forzata dopo lo step corrente.");
    } catch (err) {
      state.queuedUserMessages = state.queuedUserMessages.filter((entry) => entry !== tracking);
      setUserMessageStatus(userMessage, "error");
      toast(err.message, "error");
    }
    return;
  }

  el.input.value = "";
  state.attachments = [];
  renderAttachmentTray();
  autosize();
  const userMessage = addUserMessage(displayText, attachments, { timestamp: Date.now(), status: "sending" });
  state.activeUserMessage = userMessage;
  setBusy(true);
  try {
    await api.prompt(message, images.length ? images : undefined);
    setUserMessageStatus(userMessage, "received");
    refreshTabsSoon();
    refreshSessionsSoon();
  } catch (err) {
    setUserMessageStatus(userMessage, "error");
    if (state.activeUserMessage === userMessage) state.activeUserMessage = null;
    setBusy(false);
    if (err.code !== "PI_NOT_INSTALLED") toast(err.message, "error", 8000);
  }
}

async function runDirectBash(command, excludeFromContext) {
  const card = makeToolCard(excludeFromContext ? "bash · fuori contesto" : "bash", command);
  card.open = true;
  state.directBashRunning = true;
  state.directBashCard = card;
  setBusy(true);
  el.statusActivity.textContent = "comando shell in esecuzione…";
  try {
    const result = await api.bash(command, excludeFromContext);
    setToolCardResult(card, result.output || "", Boolean(result.exitCode));
    if (result.truncated && result.fullOutputPath) {
      card.querySelector(".tool-body pre").textContent += `\n\nOutput completo: ${result.fullOutputPath}`;
    }
    if (!result.exitCode) card.open = false;
    await refreshStats();
    refreshSessionsSoon();
  } catch (err) {
    setToolCardResult(card, err.message, true);
  } finally {
    state.directBashRunning = false;
    state.directBashCard = null;
    setBusy(false);
  }
}

function autosize() {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 220) + "px";
}

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

function stripAnsi(text) {
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

function parsedToolArgs(args) {
  if (args && typeof args === "object") return args;
  if (typeof args !== "string") return {};
  try { return JSON.parse(args); } catch { return { value: args }; }
}

function fullToolArgs(args) {
  try {
    return typeof args === "string" ? args : JSON.stringify(args) || "";
  } catch {
    return "";
  }
}

function compactProjectPath(value) {
  const input = String(value || "").replace(/\\/g, "/");
  const cwd = String(state.settings?.cwd || "").replace(/\\/g, "/").replace(/\/$/, "");
  if (cwd && (input === cwd || input.startsWith(`${cwd}/`))) return input.slice(cwd.length + 1) || ".";
  const parts = input.split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : input;
}

function changedLineCounts(args) {
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
function refreshSessionsSoon() {
  clearTimeout(sessionsTimer);
  sessionsTimer = setTimeout(refreshSessions, 400);
}

function refreshTabsSoon() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(refreshTabs, 250);
}

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
