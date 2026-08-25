"use strict";
// Chat rendering + streaming – extracted from app.js monolith. Loaded before app.js, globals shared.

// Explicit deps – no bare globals from app.js
const el = window.piStore ? window.piStore.el : {};
const state = window.piStore ? window.piStore.state : {};
function t(k, v){ return window.i18n ? window.i18n.t(k, v) : String(k); }
function toast(m,k,ms){ return window.piUi ? window.piUi.toast(m,k,ms) : void 0; }
function icon(n){ return window.piUi ? window.piUi.icon(n) : `<i data-lucide="${n}"></i>`; }
function refreshIcons(){ return window.piUi ? window.piUi.refreshIcons() : void 0; }
function escapeHtml(s){ return window.piUtils ? window.piUtils.escapeHtml(s) : String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function fmtCost(c){ return window.piUtils ? window.piUtils.fmtCost(c) : ""; }
function textOfBlocks(c){ return window.piUtils ? window.piUtils.textOfBlocks(c) : (typeof c==="string"?c:""); }
function isActivityOnly(b){ return window.piUtils ? window.piUtils.isActivityOnly(b) : false; }
function hasVisibleAssistantContent(b){ return window.piChatUtils ? window.piChatUtils.hasVisibleAssistantContent(b) : false; }
function toolIconName(n){ return window.piUtils ? window.piUtils.toolIconName(n) : "wrench"; }
function md(text){ return window.piUi ? window.piUi.md(text) : String(text ?? ""); }
function setConversationMode(a,b){ return window.piUi ? window.piUi.setConversationMode(a,b) : void 0; }
function scheduleScroll(){ return window.piUi ? window.piUi.scheduleScroll() : void 0; }
function makeToolCard(){ return window.piMedia ? window.piMedia.makeToolCard.apply(null, arguments) : null; }
function setToolCardResult(){ return window.piMedia ? window.piMedia.setToolCardResult.apply(null, arguments) : void 0; }
function renderMediaBlock(){ return window.piMedia ? window.piMedia.renderMediaBlock.apply(null, arguments) : null; }
function renderBlockMedia(){ return window.piMedia ? window.piMedia.renderBlockMedia.apply(null, arguments) : null; }
function addUserMessage(){ return window.piMedia ? window.piMedia.addUserMessage.apply(null, arguments) : null; }
function compactToolArgs(){ return window.piForms ? window.piForms.compactToolArgs.apply(null, arguments) : String(arguments[1]||"").slice(0,160); }
function fullToolArgs(a){ return window.piUtils ? window.piUtils.fullToolArgs(a) : String(a||""); }

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
  if (edits) parts.push(edits === 1 ? t("activity.edited.one") : t("activity.edited.many", {n: edits}));
  if (reads) parts.push(reads === 1 ? t("activity.read.one") : t("activity.read.many", {n: reads}));
  if (searches) parts.push(searches === 1 ? t("activity.search.one") : t("activity.search.many", {n: searches}));
  if (shells) parts.push(shells === 1 ? t("activity.shell.one") : t("activity.shell.many", {n: shells}));
  const label = parts.length ? parts.join(" e ") : t("activity.context");
  return label.charAt(0).toUpperCase() + label.slice(1);
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
      bundle.innerHTML = `<summary>${icon("paperclip")}<span class="activity-label">${escapeHtml(t("tool.activity"))}</span><span class="activity-count"></span></summary><div class="activity-list"></div>`;
      el.messages.insertBefore(bundle, node);
    }
    bundle.querySelector(".activity-list").appendChild(node);
    updateActivityBundle(bundle);
  }
  refreshIcons();
}

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
      det.innerHTML = `<summary>${escapeHtml(t("tool.thinking"))}</summary><div class="think-body"></div>`;
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
      node.innerHTML = `<summary>${escapeHtml(t("tool.thinking"))}</summary><div class="think-body"></div>`;
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


// Extracted from app.js - clearChat + updateActivityBundle
function clearChat() {
  // delegated via piStore globals - same as app.js
  const el = (typeof window !== "undefined" && window.piStore) ? window.piStore.el : {};
  const state = (typeof window !== "undefined" && window.piStore) ? window.piStore.state : {};
  function updateScrollBottomVisibility(){ return window.piUi ? window.piUi.updateScrollBottomVisibility() : void 0; }
  el.messages.innerHTML = "";
  state.streamAssistant = null;
  state.activeUserMessage = null;
  state.lastAssistantErrored = false;
  state.lastAssistantErrorWrap = null;
  state.retryAttempt = 0;
  if (state.tools) state.tools.clear();
  queueMicrotask(updateScrollBottomVisibility);
}

function updateActivityBundle(bundle) {
  const count = bundle.querySelectorAll(".tool-card, details.think").length;
  const labelEl = bundle.querySelector(".activity-label");
  if (labelEl) labelEl.textContent = (typeof activityBundleLabel === "function" ? activityBundleLabel(bundle) : "");
  const cnt = bundle.querySelector(".activity-count");
  if (cnt) cnt.textContent = count ? t("tool.activityCount", {n: count}) : "";
}

// expose for app.js delegation – unified piChat namespace + legacy globals
if (typeof window !== "undefined") {
  window.piChat = Object.assign(window.piChat || {}, {
    renderFinalMessage, toolDisplayName, activityBundleLabel, bundleActivityMessages, renderContentBlocks, beginStreamAssistant, mountStreamAssistant, streamEnsureBlock, streamApplyDelta, renderStreamTextNode, queueStreamRender, endStreamAssistant, clearChat, updateActivityBundle, hasVisibleAssistantContent: typeof hasVisibleAssistantContent!=="undefined"?hasVisibleAssistantContent:undefined
  });
  window.renderFinalMessage = renderFinalMessage;
  window.toolDisplayName = toolDisplayName;
  window.activityBundleLabel = activityBundleLabel;
  window.bundleActivityMessages = bundleActivityMessages;
  window.renderContentBlocks = renderContentBlocks;
  window.beginStreamAssistant = beginStreamAssistant;
  window.mountStreamAssistant = mountStreamAssistant;
  window.streamEnsureBlock = streamEnsureBlock;
  window.streamApplyDelta = streamApplyDelta;
  window.renderStreamTextNode = renderStreamTextNode;
  window.queueStreamRender = queueStreamRender;
  window.endStreamAssistant = endStreamAssistant;
  window.clearChat = clearChat;
  window.updateActivityBundle = updateActivityBundle;
  window.hasVisibleAssistantContent = hasVisibleAssistantContent;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = window.piChat;
}
