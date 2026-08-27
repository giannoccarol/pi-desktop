"use strict";
// Extension UI bridge — extracted from app.js monolith.
(function () {
  const api = window.piDesktop;
  const el = window.piStore ? window.piStore.el : {};
  const state = window.piStore ? window.piStore.state : {};
  function toast(m, k, ms) { return window.piUi ? window.piUi.toast(m, k, ms) : void 0; }
  function stripAnsi(text) {
    if (window.piUtils && window.piUtils.stripAnsi) return window.piUtils.stripAnsi(text);
    return String(text || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  }
  function autosize() {
    if (window.piComposer && window.piComposer.autosize) return window.piComposer.autosize();
    if (window.autosize) return window.autosize();
    const input = el.input;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 220) + "px";
  }

  let uiRequest = null;
  const recentNotifications = new Map();

  function shouldShowNotification(message, kind = "info", now = Date.now(), ttlMs = 5000) {
    const text = stripAnsi(message).trim();
    if (!text) return false;
    const key = `${kind}\u0000${text}`;
    const previous = recentNotifications.get(key);
    recentNotifications.set(key, now);
    if (recentNotifications.size > 64) {
      for (const [candidate, timestamp] of recentNotifications) {
        if (now - timestamp > ttlMs) recentNotifications.delete(candidate);
      }
    }
    return previous == null || now - previous >= ttlMs;
  }

  function handleUiRequest(msg) {
    switch (msg.method) {
      case "notify": {
        const kind = msg.notifyType === "warning" ? "warn" : msg.notifyType === "error" ? "error" : "info";
        if (shouldShowNotification(msg.message || "", kind)) toast(msg.message || "", kind);
        break;
      }
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

  function getUiRequest() { return uiRequest; }

  const apiExport = { handleUiRequest, updateExtensionStatus, updateExtensionWidget, showDialog, answerUi, stripAnsi, getUiRequest, shouldShowNotification };
  window.piExtensionBridge = apiExport;
  window.handleUiRequest = handleUiRequest;
  window.updateExtensionStatus = updateExtensionStatus;
  window.updateExtensionWidget = updateExtensionWidget;
  window.showDialog = showDialog;
  window.answerUi = answerUi;
  window.stripAnsi = stripAnsi;
  // expose uiRequest as getter/setter for wiring
  Object.defineProperty(window, "uiRequest", {
    get() { return uiRequest; },
    set(v) { uiRequest = v; },
    configurable: true,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = apiExport;
})();
