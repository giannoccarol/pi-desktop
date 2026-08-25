"use strict";
(function exposeUi(root) {
  function getEl() { return (root.piStore && root.piStore.el) || {}; }
  function getState() { return (root.piStore && root.piStore.state) || {}; }
  function t(k, v) { return root.i18n ? root.i18n.t(k, v) : String(k); }

  function toast(message, kind = "info", ms = 4200) {
    const el = getEl();
    if (!el.toasts) return;
    const icons = { info: "info", warn: "triangle-alert", error: "circle-x" };
    const n = document.createElement("div");
    n.className = `toast ${kind}`;
    n.setAttribute("role", "status");
    n.innerHTML = `<span class="toast-icon">${icon(icons[kind] || icons.info)}</span><span class="toast-msg"></span><button class="toast-close" aria-label="Chiudi">${icon("x")}</button><span class="toast-progress"></span>`;
    n.querySelector(".toast-msg").textContent = message;
    const close = () => { n.classList.add("toast-out"); n.addEventListener("animationend", () => n.remove(), { once: true }); setTimeout(() => n.remove(), 300); };
    n.querySelector(".toast-close").addEventListener("click", close);
    n.querySelector(".toast-progress").style.animationDuration = ms + "ms";
    el.toasts.appendChild(n);
    refreshIcons();
    let t = setTimeout(close, ms);
    n.addEventListener("mouseenter", () => { clearTimeout(t); n.querySelector(".toast-progress").style.animationPlayState = "paused"; });
    n.addEventListener("mouseleave", () => { n.querySelector(".toast-progress").style.animationPlayState = "running"; t = setTimeout(close, 1800); });
  }

  function refreshIcons() {
    try {
      if (root.lucide) root.lucide.createIcons({ icons: root.lucide.icons });
    } catch (err) {
      console.warn(t("icon.lucide.warn"), err);
    }
  }

  function icon(name) { return `<i data-lucide="${name}"></i>`; }

  function chatBottomDistance() {
    const el = getEl();
    if (!el.chat) return 0;
    return Math.max(0, el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight);
  }

  function captureChatScrollState() {
    const el = getEl();
    if (!el.chat) return null;
    const bottomDistance = chatBottomDistance();
    return {
      scrollTop: el.chat.scrollTop,
      bottomDistance,
      stickToBottom: bottomDistance < 140,
    };
  }

  function restoreChatScrollState(snapshot, { fallbackToBottom = true } = {}) {
    const el = getEl();
    const state = getState();
    if (!el.chat) return;
    const useBottom = snapshot?.stickToBottom ?? fallbackToBottom;
    const previous = el.chat.style.scrollBehavior;
    el.chat.style.scrollBehavior = "auto";
    if (useBottom) {
      el.chat.scrollTop = el.chat.scrollHeight;
      state.chatStickToBottom = true;
    } else {
      const maxTop = Math.max(0, el.chat.scrollHeight - el.chat.clientHeight);
      el.chat.scrollTop = Math.min(Math.max(0, Number(snapshot?.scrollTop) || 0), maxTop);
      state.chatStickToBottom = false;
    }
    requestAnimationFrame(() => { el.chat.style.scrollBehavior = previous; });
    queueMicrotask(updateScrollBottomVisibility);
  }

  function noteChatScroll() {
    const state = getState();
    state.chatStickToBottom = isNearBottom(140);
  }

  function scrollBottom(force = false) {
    const el = getEl();
    const state = getState();
    if (!el.chat) return;
    // Follow the live transcript based on the user's intent before the DOM grew.
    // Recomputing "near bottom" after inserting a tall activity block makes the
    // viewport appear to jump upwards even though the user never scrolled away.
    const shouldFollow = force || state.chatStickToBottom !== false;
    if (shouldFollow) {
      el.chat.scrollTop = el.chat.scrollHeight;
      state.chatStickToBottom = true;
      queueMicrotask(updateScrollBottomVisibility);
    }
  }

  function jumpToBottom() {
    const el = getEl();
    if (!el.chat) return;
    const previous = el.chat.style.scrollBehavior;
    el.chat.style.scrollBehavior = "auto";
    el.chat.scrollTop = el.chat.scrollHeight;
    getState().chatStickToBottom = true;
    requestAnimationFrame(() => { el.chat.style.scrollBehavior = previous; });
    queueMicrotask(updateScrollBottomVisibility);
  }

  function isNearBottom(threshold = 140) {
    const el = getEl();
    if (!el.chat) return true;
    return el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight < threshold;
  }

  function updateScrollBottomVisibility() {
    const el = getEl();
    const state = getState();
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
      noteChatScroll();
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

  function md(text) { return root.renderMarkdown ? root.renderMarkdown(text) : String(text ?? ""); }

  function setConversationMode(active, animate = true) {
    const el = getEl();
    const state = getState();
    if (state.conversationActive === active && el.modelDock && el.modelDock.classList.contains("compact") === active) return;
    if (!el.modelDock || !el.main || !el.composerActions || !el.composerWrap || !el.sendGroup) {
      if (state) state.conversationActive = active;
      return;
    }
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
        [{ transform: `translate(${dx}px, ${dy}px) scaleX(${sx})`, opacity: 0.65 }, { transform: "translate(0, 0) scaleX(1)", opacity: 1 }],
        { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    });
  }

  function closeMenus() {
    const el = getEl();
    if (el.providerMenu) el.providerMenu.classList.add("hidden");
    if (el.modelMenu) el.modelMenu.classList.add("hidden");
    if (el.thinkingMenu) el.thinkingMenu.classList.add("hidden");
  }

  function setSidebarVisible(visible) {
    const el = getEl();
    if (el.sidebar) el.sidebar.classList.toggle("collapsed", !visible);
    if (root.piDesktop && root.piDesktop.setSettings) root.piDesktop.setSettings({ sidebarVisible: visible }).catch(() => {});
  }

  function applyTheme(theme) {
    const resolved = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    try { localStorage.setItem("pi-desktop-theme", resolved); } catch {}
    const el = getEl();
    if (el.themeBtn) {
      el.themeBtn.innerHTML = icon(resolved === "dark" ? "moon" : "sun");
      el.themeBtn.title = resolved === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro";
    }
    refreshIcons();
  }

  const api = {
    toast, refreshIcons, icon,
    chatBottomDistance, captureChatScrollState, restoreChatScrollState, noteChatScroll,
    scrollBottom, jumpToBottom, isNearBottom, updateScrollBottomVisibility,
    scheduleScrollVisibility, scheduleScroll, md, setConversationMode,
    closeMenus, setSidebarVisible, applyTheme,
  };
  root.piUi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
