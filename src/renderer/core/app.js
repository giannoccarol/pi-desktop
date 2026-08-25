"use strict";

// ---------------------------------------------------------------------------
// Pi Desktop renderer
// ---------------------------------------------------------------------------

var api = window.piDesktop;
var { hasVisibleAssistantContent, collapseRetryAttempts } = window.piChatUtils;
var $ = (sel) => document.querySelector(sel);
var i18n = window.i18n;
var t = i18n ? i18n.t : (k, v) => k;
var fmt = (k, v) => t(k, v);

// Store is the single source of truth – defined in store.js and loaded before app.js
var el = window.piStore.el;
var state = window.piStore.state;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toast(m,k,ms){ return window.piUi.toast(m,k,ms); }
function refreshIcons(){ return window.piUi.refreshIcons(); }
function icon(n){ return window.piUi.icon(n); }

function relTime(ms){ return window.piUtils.relTime(ms, Date.now(), (k,v)=>t(k,v)); }

function fmtCost(c){ return window.piUtils.fmtCost(c); }

function fmtTokens(n){ return window.piUtils.fmtTokens(n); }

function basename(p){ return window.piUtils.basename(p); }

function scrollBottom(f){ return window.piUi.scrollBottom(f); }
function jumpToBottom(){ return window.piUi.jumpToBottom(); }
function isNearBottom(th){ return window.piUi.isNearBottom(th); }
function updateScrollBottomVisibility(){ return window.piUi.updateScrollBottomVisibility(); }
function scheduleScrollVisibility(){ return window.piUi.scheduleScrollVisibility(); }
function scheduleScroll(){ return window.piUi.scheduleScroll(); }
function md(text){ return window.piUi.md(text); }
function setConversationMode(a,b){ return window.piUi.setConversationMode(a,b); }

function formatBytes(b){ return window.piUtils.formatBytes(b); }

function clipboardImageExtension(m){ return window.piUtils.clipboardImageExtension(m); }

function bufferToBase64(b){ return window.piUtils.bufferToBase64(b); }

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function messageTime(v){ return window.piMessageView.messageTime(v, t); }
const USER_STATUS = window.piMedia ? window.piMedia.USER_STATUS : (()=>{ const m={}; for(const[k,def] of Object.entries(window.piMessageView.USER_STATUS_DEFS)){ m[k]={rank:def.rank,label:def.label||t(def.key)}; } return m; })();
function setUserMessageStatus(){ return window.piMedia.setUserMessageStatus.apply(null, arguments); }
function addUserMessage(){ return window.piMedia.addUserMessage.apply(null, arguments); }
function makeToolCard(){ return window.piMedia.makeToolCard.apply(null, arguments); }
function safeImageSource(){ return window.piMedia.safeImageSource.apply(null, arguments); }
function renderMediaBlock(){ return window.piMedia.renderMediaBlock.apply(null, arguments); }
function renderBlockMedia(){ return window.piMedia.renderBlockMedia.apply(null, arguments); }
function setToolCardResult(){ return window.piMedia.setToolCardResult.apply(null, arguments); }
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

function updateActivityBundle(){ return window.piChat.updateActivityBundle.apply(null, arguments); }
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

function clearChat(){ return window.piChat.clearChat.apply(null, arguments); }
async function reloadConversationFromRuntime({ restoreTab = false, paintedCache = null, switchGeneration = null } = {}) {
  // delegated to session-view.js
  return window.piSessionView.reloadConversationFromRuntime({ restoreTab, paintedCache, switchGeneration });
}
function getCachedSessionMessages(f){ return window.piSessionView.getCachedSessionMessages(f); }
function cacheSessionMessages(f,m){ return window.piSessionView.cacheSessionMessages(f,m); }
function setSessionLoading(f,o){ return window.piSessionView.setSessionLoading(f,o); }
function clearSessionLoading(){ return window.piSessionView.clearSessionLoading(); }
async function renderConversation(m,c){ return window.piSessionView.renderConversation(m,c); }
// _reloadConversationFromRuntimeBackup rimosso - delegato a piSessionView
async function openHistorySession(){ return window.piSessionView.openHistorySession.apply(null, arguments); }
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

// models extracted to models.js
async function loadModels(){ return window.piModels.loadModels.apply(null, arguments); }
function renderModelMenu(){ return window.piModels.renderModelMenu.apply(null, arguments); }
function renderProviderMenu(){ return window.piModels.renderProviderMenu.apply(null, arguments); }
function updateModelLabel(){ return window.piModels.updateModelLabel.apply(null, arguments); }
async function refreshHeaderFromState(){ return window.piModels.refreshHeaderFromState.apply(null, arguments); }
async function refreshThinkingLevels(){ return window.piModels.refreshThinkingLevels.apply(null, arguments); }
function renderThinkingMenu(){ return window.piModels.renderThinkingMenu.apply(null, arguments); }

function closeMenus(){ return window.piUi.closeMenus(); }
function setSidebarVisible(v){ return window.piUi.setSidebarVisible(v); }
function applyTheme(th){ return window.piUi.applyTheme(th); }

// auth + provider settings extracted to auth.js
async function loadProviderSettings(){ return window.piAuth.loadProviderSettings.apply(null, arguments); }
async function startProviderLogin(){ return window.piAuth.startProviderLogin.apply(null, arguments); }
function resetAuthPrompt(){ return window.piAuth.resetAuthPrompt.apply(null, arguments); }
function authEventText(){ return window.piAuth.authEventText.apply(null, arguments); }
function respondToAuthPrompt(){ return window.piAuth.respondToAuthPrompt.apply(null, arguments); }
async function loadNativePiSettings(){ return window.piAuth.loadNativePiSettings.apply(null, arguments); }
async function saveNativePiSettings(){ return window.piAuth.saveNativePiSettings.apply(null, arguments); }
function switchSettingsTab(){ return window.piAuth.switchSettingsTab.apply(null, arguments); }
function renderProviderSettings(){ return window.piAuth.renderProviderSettings.apply(null, arguments); }

// ---------------------------------------------------------------------------
// Pi package store
// ---------------------------------------------------------------------------

// package-view extracted
function installedPackageNames(){ return window.piPackageView.installedPackageNames.apply(null, arguments); }
function npmNameFromSource(){ return window.piPackageView.npmNameFromSource.apply(null, arguments); }
function installedEntryForName(){ return window.piPackageView.installedEntryForName.apply(null, arguments); }
function formatDownloads(){ return window.piPackageView.formatDownloads.apply(null, arguments); }
async function loadPackageStore(){ return window.piPackageView.loadPackageStore.apply(null, arguments); }
function renderPackageStore(){ return window.piPackageView.renderPackageStore.apply(null, arguments); }
function renderNativePackageSections(){ return window.piPackageView.renderNativePackageSections.apply(null, arguments); }
async function changePackage(){ return window.piPackageView.changePackage.apply(null, arguments); }
async function installManualSource(){ return window.piPackageView.installManualSource.apply(null, arguments); }
async function removeInstalledSource(){ return window.piPackageView.removeInstalledSource.apply(null, arguments); }
async function updatePackageTarget(){ return window.piPackageView.updatePackageTarget.apply(null, arguments); }
function appendPackageOutput(){ return window.piPackageView.appendPackageOutput.apply(null, arguments); }

// ---------------------------------------------------------------------------
// pi status / updates (external, independent from the app)
// ---------------------------------------------------------------------------

// pi status / app updates extracted to status.js - stubs delegating
function refreshPiStatus(){ return window.piStatus.refreshPiStatus.apply(null, arguments); }
function showEmptyHint(){ return window.piStatus.showEmptyHint.apply(null, arguments); }
function renderPiStatusBox(){ return window.piStatus.renderPiStatusBox.apply(null, arguments); }
function openPiModal(){ return window.piStatus.openPiModal.apply(null, arguments); }
async function runMaintenance(){ return window.piStatus.runMaintenance.apply(null, arguments); }
let appUpdateState=null;
async function setupAppUpdates(){ return window.piStatus.setupAppUpdates.apply(null, arguments); }
function handleAppUpdateState(){ return window.piStatus.handleAppUpdateState.apply(null, arguments); }

// ---------------------------------------------------------------------------
// Extension UI bridge (dialogs requested by pi extensions)
// ---------------------------------------------------------------------------

// extension bridge extracted to extension-bridge.js
let uiRequest = null;
Object.defineProperty(window, "uiRequest", { get(){ return window.piExtensionBridge ? window.piExtensionBridge.getUiRequest() : uiRequest; }, set(v){ uiRequest=v; if(window.piExtensionBridge) window.piExtensionBridge.getUiRequest = () => v; }, configurable:true });
function handleUiRequest(){ return window.piExtensionBridge.handleUiRequest.apply(null, arguments); }
function stripAnsi(){ return window.piExtensionBridge.stripAnsi.apply(null, arguments); }
function updateExtensionStatus(){ return window.piExtensionBridge.updateExtensionStatus.apply(null, arguments); }
function updateExtensionWidget(){ return window.piExtensionBridge.updateExtensionWidget.apply(null, arguments); }
function showDialog(){ return window.piExtensionBridge.showDialog.apply(null, arguments); }
function answerUi(){ return window.piExtensionBridge.answerUi.apply(null, arguments); }

// ---------------------------------------------------------------------------
// pi events
// ---------------------------------------------------------------------------

// pi events extracted to runtime-events.js
if (window.piRuntimeEvents && window.piRuntimeEvents.bindGlobalPiEvents) window.piRuntimeEvents.bindGlobalPiEvents();
else api.on("pi:event", () => {});

function parsedToolArgs(args) { return window.piUtils.parsedToolArgs.apply(null, Array.from(arguments)); }
function fullToolArgs(args) { return window.piUtils.fullToolArgs.apply(null, Array.from(arguments)); }
function compactProjectPath(value) { return window.piUtils.compactProjectPath(value, state.settings?.cwd); }
function changedLineCounts(args) { return window.piUtils.changedLineCounts.apply(null, Array.from(arguments)); }
function compactToolArgs(toolName, rawArgs) { if(window.piForms) return window.piForms.compactToolArgs(toolName, rawArgs, state.settings?.cwd);
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

var sessionsTimer = null;
var tabsTimer = null;

api.on("pi:maintenance-output", (line) => {
  if (state.maintenanceAppend) state.maintenanceAppend(line);
});

api.on("pi:package-output", appendPackageOutput);

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

// wiring + boot extracted to bootstrap.js
function wireUi(){ return window.piBootstrap.wireUi.apply(null, arguments); }
async function boot(){ return window.piBootstrap.boot.apply(null, arguments); }
window.piBootstrap.boot();
