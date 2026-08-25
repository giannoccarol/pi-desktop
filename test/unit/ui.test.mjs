import test from "node:test";
import assert from "node:assert/strict";

test("ui: module exposes expected API", async () => {
  const ui = await import("../../src/renderer/ui/ui.js");
  const m = ui.default || globalThis.piUi;
  assert.equal(typeof m.toast, "function");
  assert.equal(typeof m.refreshIcons, "function");
  assert.equal(typeof m.icon, "function");
  assert.equal(typeof m.scrollBottom, "function");
  assert.equal(typeof m.applyTheme, "function");
  assert.equal(typeof m.setConversationMode, "function");
  assert.equal(m.icon("moon"), '<i data-lucide="moon"></i>');
});

test("ui: live scroll follows prior user intent and restores each chat position", async () => {
  globalThis.requestAnimationFrame=(fn)=>{ fn(); return 1; };
  globalThis.cancelAnimationFrame=()=>{};
  const chat={scrollHeight:1200,scrollTop:700,clientHeight:400,style:{scrollBehavior:""}};
  globalThis.piStore={el:{chat},state:{chatStickToBottom:true,conversationActive:true}};
  const ui=globalThis.piUi;
  const snapshot=ui.captureChatScrollState();
  assert.equal(snapshot.scrollTop,700);
  assert.equal(snapshot.stickToBottom,true);
  chat.scrollHeight=1500;
  ui.scrollBottom();
  assert.equal(chat.scrollTop,1500,"new content follows when the user was already at the bottom");
  globalThis.piStore.state.chatStickToBottom=false;
  chat.scrollTop=420;
  chat.scrollHeight=1800;
  ui.scrollBottom();
  assert.equal(chat.scrollTop,420,"new content must not move a reader who scrolled up");
  ui.restoreChatScrollState({scrollTop:260,stickToBottom:false});
  assert.equal(chat.scrollTop,260);
  chat.scrollHeight=2400;
  ui.jumpToBottom();
  assert.equal(chat.scrollTop,2400,"opening a chat pins immediately to the latest message");
  assert.equal(globalThis.piStore.state.chatStickToBottom,true);
});

test("message-view: messageTime handles null, ms, seconds, Date", async () => {
  const mv = await import("../../src/renderer/ui/message-view.js");
  const api = mv.default || globalThis.piMessageView;
  assert.equal(api.messageTime(null, () => "na").label, "na");
  const ms = Date.now();
  assert.ok(api.messageTime(ms, (k)=>k).timestamp === ms);
  assert.ok(api.messageTime(Math.floor(ms/1000), (k)=>k).timestamp === Math.floor(ms/1000)*1000);
  assert.ok(api.messageTime(new Date(ms), (k)=>k).timestamp === ms);
});

test("message-view: nextStatusAllowed respects ranks", async () => {
  const mv = await import("../../src/renderer/ui/message-view.js");
  const api = mv.default || globalThis.piMessageView;
  assert.equal(api.nextStatusAllowed("processing", 2, "done"), true);
  assert.equal(api.nextStatusAllowed("done", 3, "processing"), false);
  assert.equal(api.nextStatusAllowed("done", 3, "error"), true);
  assert.equal(api.nextStatusAllowed("localQueued", 1, "sending"), true);
});

test("package-helpers: npmNameFromSource and formatDownloads", async () => {
  const ph = await import("../../src/renderer/lib/package-helpers.js");
  const api = ph.default || globalThis.piPackageHelpers;
  assert.equal(api.npmNameFromSource("npm:foo@1.0.0"), "foo");
  assert.equal(api.npmNameFromSource("npm:@scope/foo@2.0.0"), "@scope/foo");
  assert.equal(api.npmNameFromSource("npm:foo"), "foo");
  assert.equal(api.npmNameFromSource("other:foo"), null);
  assert.equal(api.formatDownloads(1500), "1.5K");
  assert.equal(api.formatDownloads(2500000), "2.5M");
  const set = api.installedPackageNames([{source:"npm:foo@1.0"},{source:"npm:bar@2.0"}]);
  assert.ok(set.has("foo") && set.has("bar"));
});
