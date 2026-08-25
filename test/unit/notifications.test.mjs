import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// runtime-events exports via module.exports in Node, but uses globalThis fallback
const rt = require("../../src/renderer/features/runtime-events.js");

test("notifications: shouldNotify respects enabled flag and visibility", () => {
  assert.equal(rt.shouldNotify({ enabled: false, documentHidden: true, windowFocused: false }), false);
  assert.equal(rt.shouldNotify({ enabled: true, documentHidden: true, windowFocused: true }), true);
  assert.equal(rt.shouldNotify({ enabled: true, documentHidden: false, windowFocused: false }), true);
  assert.equal(rt.shouldNotify({ enabled: true, documentHidden: false, windowFocused: true }), false);
  // defaults (no args) should not throw and return boolean
  assert.equal(typeof rt.shouldNotify({ enabled: true, documentHidden: false, windowFocused: true }), "boolean");
});

test("notifications: shouldNotify uses localStorage when enabled not provided", () => {
  const fakeTrue = { getItem: () => null };
  const fakeFalse = { getItem: () => "false" };
  const fakeZero = { getItem: () => "0" };
  assert.equal(rt.shouldNotify({ storage: fakeTrue, documentHidden: true, windowFocused: true }), true);
  assert.equal(rt.shouldNotify({ storage: fakeFalse, documentHidden: true, windowFocused: true }), false);
  assert.equal(rt.shouldNotify({ storage: fakeZero, documentHidden: true, windowFocused: true }), false);
});

test("notifications: buildNotificationPayload for agent_settled and turn_end", () => {
  const p1 = rt.buildNotificationPayload({ type: "agent_settled" });
  assert.equal(typeof p1.title, "string");
  assert.ok(p1.title.length > 0);
  assert.equal(typeof p1.body, "string");
  assert.ok(p1.body.length > 0);

  const p2 = rt.buildNotificationPayload({ type: "turn_end" });
  assert.equal(typeof p2.title, "string");
  assert.equal(typeof p2.body, "string");

  const pErr = rt.buildNotificationPayload({ type: "agent_settled", error: "boom" });
  assert.match(pErr.body, /boom/);

  const pOther = rt.buildNotificationPayload({ type: "something_else" });
  assert.equal(pOther.title, "Pi Desktop");
});

test("notifications: buildNotificationPayload uses custom t function", () => {
  const t = (k) => (k === "notification.agentDone" ? "Fatto" : k);
  const p = rt.buildNotificationPayload({ type: "agent_settled" }, { t });
  assert.equal(p.title, "Fatto");
});

test("notifications: isNotificationsEnabled / isSoundEnabled handle storage", () => {
  const sEnabled = { getItem: (k) => (k === "pi-desktop-notifications-enabled" ? null : null) };
  assert.equal(rt.isNotificationsEnabled(sEnabled), true);
  const sDisabled = { getItem: (k) => (k === "pi-desktop-notifications-enabled" ? "false" : null) };
  assert.equal(rt.isNotificationsEnabled(sDisabled), false);
  const sSoundOn = { getItem: (k) => (k === "pi-desktop-notifications-sound" ? "true" : null) };
  assert.equal(rt.isSoundEnabled(sSoundOn), true);
  const sSoundOff = { getItem: (k) => null };
  assert.equal(rt.isSoundEnabled(sSoundOff), false);
});

test("notifications: createRuntimeEvents handleEvent triggers Notification when background", async () => {
  let notifCreated = false;
  const origNotif = globalThis.Notification;
  class FakeNotif {
    static permission = "granted";
    static requestPermission = () => Promise.resolve("granted");
    constructor(title, opts) {
      notifCreated = true;
      this.title = title;
      this.body = opts?.body;
    }
  }
  globalThis.Notification = FakeNotif;
  globalThis.window = globalThis;
  globalThis.document = { hidden: true, hasFocus: () => false };
  // also need pi globals for runtime-events internals
  globalThis.window.piStore = { state: { tabs: [], activeTabId: null, tools: new Map(), lastAssistantErrored: false, lastAssistantErrorWrap: null, retryAttempt: 0, activeUserMessage: null, queuedUserMessages: [], nativeQueue: {} }, el: { statusActivity: { textContent: "" } } };
  globalThis.window.i18n = { t: (k) => k };
  globalThis.window.piUi = { toast: () => {}, refreshIcons: () => {}, icon: () => "" };
  globalThis.window.piUtils = { textOfBlocks: () => "", fullToolArgs: () => "", toolIconName: () => "" };
  globalThis.window.piMedia = { setUserMessageStatus: () => {}, makeToolCard: () => ({ dataset: {}, querySelector: () => null }), setToolCardResult: () => {}, renderBlockMedia: () => {} };
  globalThis.window.piChat = { beginStreamAssistant: () => {}, streamApplyDelta: () => {}, endStreamAssistant: () => {} };
  globalThis.window.piComposer = { setBusy: () => {}, refreshStats: () => {} };
  globalThis.window.piSidebar = { refreshSessionsSoon: () => {}, refreshTabsSoon: () => {}, renderTabs: () => {}, renderProjects: () => {} };
  globalThis.window.piSessionView = { markActiveCacheDirty: () => {}, refreshSessionCache: () => {} };
  globalThis.window.piForms = { compactToolArgs: () => "" };
  // need localStorage enabled
  globalThis.localStorage = { getItem: () => null };
  const api = { on: () => {} };
  const el = { statusActivity: { textContent: "" } };
  const state = { tabs: [], activeTabId: null, tools: new Map(), lastAssistantErrored: false, lastAssistantErrorWrap: null, retryAttempt: 0, activeUserMessage: null, queuedUserMessages: [], nativeQueue: {} };
  const noop = () => {};
  const ev = rt.createRuntimeEvents({ state, el, api, t: (k)=>k, icon: ()=> "", escapeHtml: (s)=>s, textOfBlocks: ()=> "", compactToolArgs: ()=> "", fullToolArgs: ()=> "", toolIconName: ()=> "", makeToolCard: ()=> ({dataset:{}, querySelector:()=>null}), setToolCardResult: noop, renderBlockMedia: noop, beginStreamAssistant: noop, streamApplyDelta: noop, endStreamAssistant: noop, setBusy: noop, setUserMessageStatus: noop, refreshStats: noop, refreshSessionsSoon: noop, refreshTabsSoon: noop, refreshIcons: noop, renderQueuePanel: noop, renderTabs: noop, renderProjects:noop, updateNavigationStatus:noop, handleUiRequest: noop, scheduleScroll: noop });
  notifCreated = false;
  ev.handleEvent({ type: "agent_settled" });
  assert.equal(notifCreated, true);
  notifCreated = false;
  // when foregrounded, should not notify
  globalThis.document.hidden = false;
  globalThis.document.hasFocus = () => true;
  ev.handleEvent({ type: "turn_end" });
  assert.equal(notifCreated, false);
  // cleanup
  if (origNotif) globalThis.Notification = origNotif;
  else delete globalThis.Notification;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
});
