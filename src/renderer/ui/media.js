"use strict";
// Media / tool-card helpers — extracted from app.js monolith.
(function () {
  const el = window.piStore ? window.piStore.el : {};
  const stateRef = window.piStore ? window.piStore.state : null;
  function t(k, v) { return window.i18n ? window.i18n.t(k, v) : String(k); }
  function escapeHtml(s) {
    if (window.piUtils && window.piUtils.escapeHtml) return window.piUtils.escapeHtml(s);
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function icon(n) { return window.piUi ? window.piUi.icon(n) : `<i data-lucide="${n}"></i>`; }
  function refreshIcons() { return window.piUi ? window.piUi.refreshIcons() : void 0; }
  function scheduleScroll() { return window.piUi ? window.piUi.scheduleScroll() : void 0; }
  function toolIconName(name) {
    if (window.piUtils && window.piUtils.toolIconName) return window.piUtils.toolIconName(name);
    const n = String(name || "").toLowerCase();
    if (n === "read") return "book-open";
    if (["edit","write"].includes(n)) return "pencil";
    if (["grep","find","search"].includes(n)) return "search";
    if (["bash","shell","powershell"].some(v=>n.startsWith(v))) return "terminal";
    if (n === "ls") return "folder-open";
    return "wrench";
  }

  // USER_STATUS built from message-view defs — keep same as app.js, but defer t() to call-time (i18n loads after media)
  const USER_STATUS_FALLBACK_DEFS = {
    sending: { rank:0, key: "status.sending" },
    localQueued: { rank:1, key: "status.queued", label: "in coda nell’app · non ancora inviato" },
    received:{rank:1,key:"status.received"},
    queued:{rank:1,key:"status.queued"},
    processing:{rank:2,key:"status.processing"},
    retrying:{rank:2,key:"status.retrying"},
    done:{rank:3,key:"status.done"},
    historical:{rank:3,key:"status.historical"},
    failed:{rank:4,key:"status.failed"},
    interrupted:{rank:4,key:"status.interrupted"},
    error:{rank:4,key:"status.error"},
  };
  const USER_STATUS = new Proxy({}, {
    get(_, prop){
      const defs = window.piMessageView?.USER_STATUS_DEFS?.[prop];
      if(defs) return { rank: defs.rank, key: defs.key, get label(){ return t(defs.key); } };
      const fb = USER_STATUS_FALLBACK_DEFS[prop];
      if(fb) return { rank: fb.rank, key: fb.key, get label(){ return fb.label || t(fb.key); } };
      return undefined;
    },
    has(_, prop){ return !!(window.piMessageView?.USER_STATUS_DEFS?.[prop] || USER_STATUS_FALLBACK_DEFS[prop]); },
    ownKeys(){ const a = Object.keys(window.piMessageView?.USER_STATUS_DEFS||{}); const b = Object.keys(USER_STATUS_FALLBACK_DEFS); return [...new Set([...a,...b])]; },
    getOwnPropertyDescriptor(_, prop){
      const v = this.get(_, prop); if(!v) return undefined; return { configurable:true, enumerable:true, value:v };
    }
  });

  function messageTime(v) {
    if (window.piMessageView && window.piMessageView.messageTime) return window.piMessageView.messageTime(v, t);
    return { timestamp: null, label: t("time.notAvailable") };
  }

  function setUserMessageStatus(wrap, status) {
    if (!wrap?.isConnected || !USER_STATUS[status]) return;
    const currentRank = Number(wrap.dataset.statusRank ?? -1);
    const next = USER_STATUS[status];
    const allowed = window.piMessageView ? window.piMessageView.nextStatusAllowed(wrap.dataset.status, currentRank, status) : true;
    if (!allowed) return;
    wrap.dataset.status = status;
    wrap.dataset.statusRank = String(next.rank);
    if (["received","queued","processing","retrying","done","failed","interrupted"].includes(status) && !wrap.dataset.receivedAt) {
      wrap.dataset.receivedAt = new Date().toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
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
    const messagesEl = el.messages;
    const emptyState = el.emptyState;
    if (emptyState) emptyState.classList.add("hidden");
    if (window.piUi && window.piUi.setConversationMode) window.piUi.setConversationMode(true);
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
    messagesEl.appendChild(wrap);
    setUserMessageStatus(wrap, options.status || "historical");
    refreshIcons();
    scheduleScroll();
    return wrap;
  }

  function makeToolCard(toolName, argsPreview, parent, fullArgs) {
    const p = parent || el.messages;
    const card = document.createElement("details");
    card.className = "tool-card";
    card.dataset.tool = String(toolName || "tool").toLowerCase();
    if (fullArgs != null) {
      try { card.dataset.args = typeof fullArgs === "string" ? fullArgs : JSON.stringify(fullArgs); } catch { card.dataset.args = String(fullArgs); }
    }
    const displayName = (window.piChat && window.piChat.toolDisplayName)
      ? window.piChat.toolDisplayName(toolName)
      : (toolName || "tool");
    card.innerHTML =
      `<summary><span class="tool-name">${icon(toolIconName(toolName))} ${escapeHtml(displayName)}</span>` +
      `<span class="tool-args">${escapeHtml(argsPreview || "")}</span>` +
      `<span class="tool-state">in esecuzione…</span></summary>` +
      `<div class="tool-body"><pre></pre></div>`;
    p.appendChild(card);
    refreshIcons();
    scheduleScroll();
    return card;
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
    // diff view for edit/write
    try {
      const tool = String(card.dataset.tool || "").toLowerCase();
      if ((tool === "edit" || tool === "write") && window.piDiffView) {
        let parsedArgs = {};
        const rawArgs = card.dataset.args;
        if (rawArgs) {
          try { parsedArgs = JSON.parse(rawArgs); } catch { parsedArgs = {}; }
        }
        const html = window.piDiffView.renderDiff(tool, parsedArgs, text);
        if (html) {
          const body = card.querySelector(".tool-body");
          // remove previous diff if any
          body.querySelector(".diff-view")?.remove();
          const tmp = document.createElement("div");
          tmp.innerHTML = html;
          const diffEl = tmp.firstElementChild;
          if (diffEl) body.insertBefore(diffEl, pre);
          refreshIcons();
        }
      }
    } catch {}
    renderBlockMedia(card.querySelector(".tool-body"), content, "Output");
  }

  const apiExport = {
    USER_STATUS, messageTime, setUserMessageStatus, addUserMessage, makeToolCard,
    escapeHtml, safeImageSource, renderMediaBlock, renderBlockMedia, setToolCardResult,
  };
  window.piMedia = apiExport;
  // expose globals for legacy code paths
  window.USER_STATUS = USER_STATUS;
  window.messageTime = messageTime;
  window.setUserMessageStatus = setUserMessageStatus;
  window.addUserMessage = addUserMessage;
  window.makeToolCard = makeToolCard;
  // escapeHtml already via piUtils but keep wrapper
  if (!window.escapeHtml) window.escapeHtml = escapeHtml;
  window.safeImageSource = safeImageSource;
  window.renderMediaBlock = renderMediaBlock;
  window.renderBlockMedia = renderBlockMedia;
  window.setToolCardResult = setToolCardResult;
  if (typeof module !== "undefined" && module.exports) module.exports = apiExport;
})();
