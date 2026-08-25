import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname,"..","..");

test("session-view extracted: app.js delegates to piSessionView",()=>{
  const app=fs.readFileSync(path.join(root,"src/renderer/features/chat/session-view.js"),"utf8");
  assert.match(app,/function getCachedSessionMessages/);
  assert.match(app,/function openHistorySession/);
  assert.match(app,/toast.openSessionFail/);
  assert.match(app,/toast.sessionTruncated/);
  assert.match(app,/\[openHistorySession\] pin/);
  const main=fs.readFileSync(path.join(root,"src/renderer/core/app.js"),"utf8");
  assert.match(main,/piSessionView/);
  const html=fs.readFileSync(path.join(root,"src/renderer/index.html"),"utf8");
  assert.ok(html.indexOf("session-view.js")>html.indexOf("session.js"));
  const sidebar=fs.readFileSync(path.join(root,"src/renderer/ui/sidebar.js"),"utf8");
  assert.match(sidebar,/reloadConversationFromRuntime\(\{[\s\S]*?pinToBottom:\s*true/);
  assert.match(sidebar,/waitUntilPinnedToBottom/);
});

test("session cache: explicit tab aliases stay isolated and dirty entries are not painted", async()=>{
  globalThis.window=globalThis;
  globalThis.requestAnimationFrame=(fn)=>{ fn(); return 1; };
  const state={
    activeTabId:"tab-b",
    activeSessionFile:"/sessions/b.jsonl",
    tabs:[
      {id:"tab-a",sessionFile:"/sessions/a.jsonl"},
      {id:"tab-b",sessionFile:"/sessions/b.jsonl"},
    ],
  };
  globalThis.piStore={el:{},state};
  globalThis.piChatUtils={collapseRetryAttempts:(messages)=>messages};
  globalThis.piDesktop={
    getMessages:async(tabId)=>({messages:[{role:"user",content:`fresh:${tabId}`}] }),
    getState:async(tabId)=>({tabId,sessionFile:`/sessions/${tabId.slice(-1)}.jsonl`}),
  };
  await import(`../../src/renderer/features/chat/session-view.js?cache-test=${Date.now()}`);
  const cache=globalThis.piSessionView;
  const original=[{role:"user",content:"cached-a"}];
  cache.cacheSessionMessages("/sessions/a.jsonl",original,"tab-a");
  assert.equal(cache.getCachedSessionMessages(null,"tab-b"),null,"active tab must not receive another tab's alias");
  assert.deepEqual(cache.getCachedSessionMessages(null,"tab-a"),original);
  cache.markSessionCacheDirty("/sessions/a.jsonl","tab-a");
  assert.equal(cache.getCachedSessionMessages(null,"tab-a"),null,"dirty snapshots must not flash during a switch");
  assert.deepEqual(cache.getCachedSessionMessages(null,"tab-a",{allowDirty:true}),original);
  assert.equal(await cache.refreshSessionCache("tab-a"),true);
  assert.equal(cache.getCachedSessionMessages(null,"tab-a")[0].content,"fresh:tab-a");

  const nodes=[{id:"message-a"},{id:"message-b"}];
  globalThis.piStore.el.messages={
    childNodes:nodes,
    replaceChildren(...next){ this.childNodes=next; },
  };
  globalThis.piChat={clearChat(){ globalThis.piStore.el.messages.childNodes=[]; }};
  cache.cacheSessionDom("/sessions/a.jsonl","tab-a");
  globalThis.piStore.el.messages.childNodes=[];
  assert.deepEqual(cache.restoreCachedSessionDom("/sessions/a.jsonl","tab-a"),cache.getCachedSessionMessages(null,"tab-a"));
  assert.deepEqual(globalThis.piStore.el.messages.childNodes,nodes,"cached DOM nodes should be remounted without rerendering");
});
