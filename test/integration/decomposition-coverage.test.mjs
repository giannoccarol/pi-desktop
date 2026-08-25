"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

// Ensure window exists for renderer modules that expect browser global
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (!globalThis.document) {
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} }, dataset:{}, appendChild(){}, setAttribute(){}, addEventListener(){}, querySelector(){return null}, querySelectorAll(){return []} }),
    documentElement: { dataset: {} },
  };
}
globalThis.piStore = { el: {}, state: { providers:[], commandUsage:{}, settings:{ cwd:'/tmp' }, expandedProjects: new Set(['/tmp']), tabs:[], extensionStatuses:new Map(), extensionWidgets:new Map(), busy:false, activeUserMessage:null, lastAssistantErrored:false, tools:new Map(), directBashCard:null, nativeQueue:{steering:[],followUp:[]}, queuedUserMessages:[], localQueue:[] } };
globalThis.piDesktop = { on(){}, listProviders: async()=>[], loginProvider: async()=>[], listTabs: async()=>[], getSettings: async()=>({cwd:'/tmp', language:'it'}), getMessages: async()=>({messages:[]}), getState: async()=>({}), getAvailableModels: async()=>({models:[]}), getThinkingLevels: async()=>({levels:[]}) };
globalThis.i18n = { t:(k)=>k, getLang:()=>'it', setLang(){}, applyI18n(){} };
globalThis.piUtils = require("../../src/renderer/lib/utils.js");
globalThis.piMessageView = require("../../src/renderer/ui/message-view.js");
globalThis.piChat = { toolDisplayName:(n)=>n||"tool" };
globalThis.piChatUtils = { collapseRetryAttempts:(m)=>m, hasVisibleAssistantContent:()=>true };
globalThis.piUi = { toast(){}, refreshIcons(){}, icon(n){return `<i data-lucide="${n}"></i>`}, scrollBottom(){}, jumpToBottom(){}, isNearBottom(){return true}, updateScrollBottomVisibility(){}, scheduleScrollVisibility(){}, scheduleScroll(){}, md(t){return t}, setConversationMode(){}, closeMenus(){}, setSidebarVisible(){}, applyTheme(){} };
globalThis.piForms = { compactToolArgs: (n,a)=>String(a||"").slice(0,20) };
globalThis.piModels = { loadModels: async()=>[], renderModelMenu(){}, renderProviderMenu(){}, updateModelLabel(){}, refreshHeaderFromState: async()=>{}, refreshThinkingLevels: async()=>[] };
globalThis.piPackageView = { installedPackageNames:()=>[], npmNameFromSource:()=>"", installedEntryForName:()=>null, formatDownloads:()=>"", loadPackageStore: async()=>{}, renderPackageStore(){}, renderNativePackageSections(){}, changePackage: async()=>{}, installManualSource: async()=>{}, removeInstalledSource: async()=>{}, updatePackageTarget: async()=>{}, appendPackageOutput(){} };
globalThis.piStatus = { refreshPiStatus: async()=>null, showEmptyHint(){}, renderPiStatusBox(){}, openPiModal(){}, runMaintenance: async()=>({ok:true}), setupAppUpdates: async()=>{}, handleAppUpdateState(){} };
globalThis.piSidebar = { renderProjects(){}, renderTabs(){}, refreshSessions: async()=>{}, refreshTabs: async()=>{}, initSidebarResize(){}, initChatTooltip(){}, initSearchEnhancement(){}, stashActiveTabContext(){}, restoreActiveTabContext(){}, refreshSessionsSoon(){}, refreshTabsSoon(){} };
globalThis.piComposer = { setBusy(){}, refreshStats: async()=>{}, renderAttachmentTray(){}, pickAttachments: async()=>[], pasteClipboardImages(){}, autosize(){}, sendMessage: async()=>{}, abortCurrentWork: async()=>{}, renderQueuePanel(){}, resetQueueState(){}, dispatchNextLocalMessage: async()=>{} };
globalThis.piPalette = { openCommandPalette(){}, slashMatches:()=>[], renderSlashSuggestions(){}, hideSlashSuggestions(){}, applySlashSuggestion(){}, filteredCommands:()=>[], renderCommandPalette(){}, chooseCommand(){} };
globalThis.piSession = { openSessionTree(){}, loadSessionTree: async()=>{}, newChildSession: async()=>{}, cloneActiveSession: async()=>{}, openSessionTools(){}, renameSession: async()=>{}, compactSession: async()=>{}, newChat: async()=>{} };
globalThis.piSessionView = { getCachedSessionMessages:()=>null, cacheSessionMessages(){}, setSessionLoading(){}, clearSessionLoading(){}, renderConversation: async()=>true, reloadConversationFromRuntime: async()=>true, openHistorySession: async()=>{} };
globalThis.lucide = { createIcons(){}, icons:{} };

test("decomposition: auth.js exposes expected API and is require-able in Node", () => {
  const auth = require("../../src/renderer/features/auth.js");
  assert.equal(typeof auth.loadProviderSettings, "function");
  assert.equal(typeof auth.renderProviderSettings, "function");
  assert.equal(typeof auth.loadNativePiSettings, "function");
  assert.equal(typeof auth.saveNativePiSettings, "function");
  assert.equal(typeof auth.switchSettingsTab, "function");
  assert.equal(typeof auth.authEventText, "function");
  assert.equal(auth.authEventText({type:"auth_url", instructions:"go", url:"https://a.b"}), "go\nhttps://a.b");
  assert.equal(auth.authEventText({type:"device_code", verificationUri:"https://v", userCode:"ABC"}), "Apri https://v e inserisci il codice:\nABC");
  assert.equal(auth.authEventText({message:"hello"}), "hello");
});

test("decomposition: extension-bridge.js exposes expected API", () => {
  const ext = require("../../src/renderer/features/extension-bridge.js");
  assert.equal(typeof ext.handleUiRequest, "function");
  assert.equal(typeof ext.updateExtensionStatus, "function");
  assert.equal(typeof ext.updateExtensionWidget, "function");
  assert.equal(typeof ext.showDialog, "function");
  assert.equal(typeof ext.answerUi, "function");
  assert.equal(typeof ext.stripAnsi, "function");
  assert.equal(ext.stripAnsi("\x1b[31mred\x1b[0m"), "red");
  assert.equal(ext.stripAnsi("plain"), "plain");
});

test("decomposition: media.js exposes expected API and safeImageSource logic", () => {
  const media = require("../../src/renderer/ui/media.js");
  assert.equal(typeof media.safeImageSource, "function");
  assert.equal(typeof media.renderMediaBlock, "function");
  assert.equal(typeof media.setToolCardResult, "function");
  assert.equal(typeof media.addUserMessage, "function");
  assert.equal(typeof media.makeToolCard, "function");
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const src = media.safeImageSource({mimeType:"image/png", data: pngBase64});
  assert.ok(src && src.startsWith("data:image/png;base64,"), "should return data url for valid png");
  assert.equal(media.safeImageSource({mimeType:"image/svg+xml", data: pngBase64}), null);
  const large = "a".repeat(28_000_001);
  assert.equal(media.safeImageSource({mimeType:"image/png", data: large}), null);
  const dataUrl = "data:image/png;base64," + pngBase64;
  assert.equal(media.safeImageSource({mimeType:"image/png", data: dataUrl}), dataUrl);
  assert.equal(media.safeImageSource({mimeType:"image/jpeg", data: dataUrl}), null);
  assert.equal(media.safeImageSource({mimeType:"image/png", data:"not-base64!@#"}), null);
});

test("decomposition: bootstrap.js exposes wireUi and boot", () => {
  const boot = require("../../src/renderer/core/bootstrap.js");
  assert.equal(typeof boot.wireUi, "function");
  assert.equal(typeof boot.boot, "function");
  const content = fs.readFileSync(path.join(root, "src/renderer/core/bootstrap.js"), "utf8");
  assert.match(content, /el\.sendBtn\.addEventListener/);
  assert.match(content, /api\.start/);
});

test("decomposition: runtime-events.js exposes both factories", () => {
  const rt = require("../../src/renderer/features/runtime-events.js");
  assert.equal(typeof rt.createRuntimeEvents, "function");
  assert.equal(typeof rt.bindGlobalPiEvents, "function");
  const state = { tabs:[{id:"a", busy:false}], activeTabId:"a", lastAssistantErrored:false, lastAssistantErrorWrap:null, retryAttempt:0, busy:false, activeUserMessage:null, tools:new Map(), directBashCard:null, nativeQueue:{steering:[],followUp:[]}, queuedUserMessages:[], extensionStatuses:new Map(), extensionWidgets:new Map() };
  const el = { statusActivity:{textContent:""} };
  let busyVal=null;
  const api = { on(){}} ;
  const factory = rt.createRuntimeEvents({
    state, el, api,
    t:(k)=>k, icon:(n)=>n, escapeHtml:(s)=>s,
    textOfBlocks:(c)=> typeof c==="string"?c:"",
    compactToolArgs:()=>"args", fullToolArgs:()=>"full", toolIconName:()=>"wrench",
    makeToolCard:()=>({dataset:{}, querySelector:()=>({textContent:""})}),
    setToolCardResult(){}, renderBlockMedia(){},
    beginStreamAssistant(){}, streamApplyDelta(){}, endStreamAssistant(){},
    setBusy:(b)=>{busyVal=b}, setUserMessageStatus(){}, refreshStats(){}, refreshSessionsSoon(){}, refreshTabsSoon(){},
    refreshIcons(){}, renderQueuePanel(){}, renderTabs(){}, renderProjects(){}, handleUiRequest(){}, scheduleScroll(){}
  });
  assert.equal(typeof factory.handleEvent, "function");
  assert.equal(typeof factory.bind, "function");
  factory.handleEvent({type:"agent_start"});
  assert.equal(busyVal, true);
  assert.equal(state.retryAttempt, 0);
});

test("decomposition: app.js delegates and stays under 1000 lines", () => {
  const app = fs.readFileSync(path.join(root, "src/renderer/core/app.js"), "utf8");
  const lines = app.split("\n").length;
  assert.ok(lines < 1000, `app.js lines ${lines} should be <1000`);
  assert.ok(lines > 250, `app.js lines ${lines} should be >250`);
  assert.ok(app.includes("window.piAuth"), "should delegate to piAuth");
  assert.ok(app.includes("window.piBootstrap"), "should delegate to piBootstrap");
  assert.ok(app.includes("bindGlobalPiEvents"), "should delegate to runtime-events");
  const wireWrappers = (app.match(/function wireUi\(\)\{ return window\.piBootstrap\.wireUi/g) || []).length;
  assert.equal(wireWrappers, 1, "should have exactly one thin wireUi wrapper");
});

test("chat activity grouping keeps existing bundles mounted", () => {
  const chat = fs.readFileSync(path.join(root, "src/renderer/features/chat/chat.js"), "utf8");
  const start = chat.indexOf("function bundleActivityMessages");
  const end = chat.indexOf("function renderContentBlocks", start);
  const implementation = chat.slice(start, end);
  assert.doesNotMatch(implementation, /querySelectorAll\(\":scope > \.activity-bundle\"\)[\s\S]*bundle\.remove\(\)/);
  assert.match(implementation, /scheduleScroll\(\)/);
});
