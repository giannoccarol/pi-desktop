"use strict";
(function exposeComposerModule() {
// Composer + queue – extracted from app.js monolith (head). Loaded before app.js, globals shared.

// Explicit deps – no bare globals from app.js
var el = window.piStore ? window.piStore.el : {};
var state = window.piStore ? window.piStore.state : {};
var api = window.piDesktop;
function t(k, v){ return window.i18n ? window.i18n.t(k, v) : String(k); }
function toast(m,k,ms){ return window.piUi ? window.piUi.toast(m,k,ms) : void 0; }
function icon(n){ return window.piUi ? window.piUi.icon(n) : `<i data-lucide="${n}"></i>`; }
function refreshIcons(){ return window.piUi ? window.piUi.refreshIcons() : void 0; }
function escapeHtml(s){ return window.piUtils ? window.piUtils.escapeHtml(s) : String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function formatBytes(b){ return window.piUtils ? window.piUtils.formatBytes(b) : String(b); }
function clipboardImageExtension(m){ return window.piUtils ? window.piUtils.clipboardImageExtension(m) : "png"; }
function bufferToBase64(b){ return window.piUtils ? window.piUtils.bufferToBase64(b) : ""; }
function fmtCost(c){ return window.piUtils ? window.piUtils.fmtCost(c) : ""; }
function fmtTokens(n){ return window.piUtils ? window.piUtils.fmtTokens(n) : ""; }
function addUserMessage(){ return window.piMedia ? window.piMedia.addUserMessage.apply(null, arguments) : null; }
function makeToolCard(){ return window.piMedia ? window.piMedia.makeToolCard.apply(null, arguments) : null; }
function setToolCardResult(){ return window.piMedia ? window.piMedia.setToolCardResult.apply(null, arguments) : void 0; }
function setUserMessageStatus(){ return window.piMedia ? window.piMedia.setUserMessageStatus.apply(null, arguments) : void 0; }
function refreshSessionsSoon(){ return window.piSidebar ? window.piSidebar.refreshSessionsSoon.apply(null, arguments) : (window.refreshSessionsSoon ? window.refreshSessionsSoon() : void 0); }
function refreshTabsSoon(){ return window.piSidebar ? window.piSidebar.refreshTabsSoon.apply(null, arguments) : (window.refreshTabsSoon ? window.refreshTabsSoon() : void 0); }
function markActiveCacheDirty(){ return window.piSessionView?.markActiveCacheDirty?.(state.activeTabId); }

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
    const actions = document.createElement("div");
    actions.className = "queue-actions";
    const edit = document.createElement("button");
    edit.className = "queue-action";
    edit.type = "button";
    edit.title = "Modifica";
    edit.setAttribute("aria-label", "Modifica messaggio in coda");
    edit.innerHTML = icon("pencil");
    edit.addEventListener("click", () => editLocalMessage(item.id, row));
    const force = document.createElement("button");
    force.className = "queue-action force";
    force.type = "button";
    force.title = "Forza invio";
    force.setAttribute("aria-label", "Forza invio");
    force.innerHTML = icon("zap");
    force.disabled = state.directBashRunning;
    force.addEventListener("click", () => forceLocalMessage(item.id));
    const remove = document.createElement("button");
    remove.className = "queue-action remove";
    remove.type = "button";
    remove.title = "Rimuovi";
    remove.setAttribute("aria-label", "Rimuovi dalla coda");
    remove.innerHTML = icon("x");
    remove.addEventListener("click", () => removeLocalMessage(item.id));
    actions.append(edit, force, remove);
    row.append(actions);
    el.queuedNote.appendChild(row);
  }
  const appendNative = (text, forced) => {
    const row = document.createElement("div");
    row.className = "queue-row";
    row.innerHTML = `<span class="queue-badge ${forced ? "force" : "wait"}">${forced ? "forzato" : "dopo"}</span><span class="queue-text"></span><span class="queue-native-state">già inviato a Pi</span>`;
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
  save.type = "button";
  save.title = "Salva";
  save.setAttribute("aria-label", "Salva modifica");
  save.innerHTML = icon("check");
  const cancel = document.createElement("button");
  cancel.className = "queue-action";
  cancel.type = "button";
  cancel.title = "Annulla";
  cancel.setAttribute("aria-label", "Annulla modifica");
  cancel.innerHTML = icon("x");
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
  const actions = document.createElement("div");
  actions.className = "queue-actions";
  actions.append(save, cancel);
  row.append(actions);
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
  if (state.openingSessionFile) {
    toast(t("toast.sessionStillOpening"), "info", 2200);
    return;
  }
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

  markActiveCacheDirty();
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

// Unified export – both piComposer namespace and legacy globals
if (typeof window !== "undefined") {
  window.piComposer = Object.assign(window.piComposer || {}, {
    renderAttachmentTray, pickAttachments, pasteClipboardImages, insertCodeBlock, refreshStats, setBusy, cancelQueuedMessagesForStop, finishInterruptedRendering, abortCurrentWork, clearComposerAfterQueue, renderQueuePanel, editLocalMessage, removeLocalMessage, deliverQueuedItem, forceLocalMessage, dispatchNextLocalMessage, resetQueueState, sendMessage, runDirectBash, autosize
  });
  window.renderAttachmentTray = renderAttachmentTray;
  window.pickAttachments = pickAttachments;
  window.pasteClipboardImages = pasteClipboardImages;
  window.refreshStats = refreshStats;
  window.setBusy = setBusy;
  window.abortCurrentWork = abortCurrentWork;
  window.renderQueuePanel = renderQueuePanel;
  window.sendMessage = sendMessage;
  window.runDirectBash = runDirectBash;
  window.autosize = autosize;
  window.resetQueueState = resetQueueState;
  window.dispatchNextLocalMessage = dispatchNextLocalMessage;
}
if (typeof module !== "undefined" && module.exports) module.exports = window.piComposer;
})();
