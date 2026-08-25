"use strict";
(function exposeMentionsModule() {
// Mentions @ – file/folder autocomplete. Extracted/initial implementation for @ flow.
// Loaded before bootstrap.js, globals shared via piMentions.

var el = window.piStore ? window.piStore.el : {};
var state = window.piStore ? window.piStore.state : {};
var api = window.piDesktop;

function t(k, v) { return window.i18n ? window.i18n.t(k, v) : String(k); }
function escapeHtml(s) { return window.piUtils ? window.piUtils.escapeHtml(s) : String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function icon(n) { return window.piUi ? window.piUi.icon(n) : `<i data-lucide="${n}"></i>`; }
function refreshIcons() { return window.piUi ? window.piUi.refreshIcons() : void 0; }
function resizeComposerInput() { return window.piComposer?.autosize?.(); }

let mentionFetchId = 0;
let mentionDebounceTimer = null;

function currentAtQuery() {
  if (!el.input) return null;
  const cursor = el.input.selectionStart;
  if (cursor == null || cursor !== el.input.selectionEnd) return null;
  const before = el.input.value.slice(0, cursor);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) return null;
  const query = before.slice(atIdx + 1);
  if (query.includes(" ") || query.includes("\n") || query.includes("\t")) return null;
  return { query, atIdx, before, after: el.input.value.slice(cursor) };
}

function hideAtSuggestions() {
  if (el.atSuggestions) {
    el.atSuggestions.classList.add("hidden");
    el.atSuggestions.innerHTML = "";
  }
  state.mentionQuery = null;
}

function applyAtSuggestion(candidate) {
  if (!el.input || !candidate) return;
  const ctx = currentAtQuery();
  if (!ctx) return;
  const { atIdx } = ctx;
  const cursor = el.input.selectionStart;
  const after = el.input.value.slice(cursor);
  const afterTokenRemainder = (after.match(/^[^\s]*/) || [""])[0];
  const afterRest = after.slice(afterTokenRemainder.length);
  const prefix = el.input.value.slice(0, atIdx);
  const insertion = `@${candidate.path} `;
  el.input.value = `${prefix}${insertion}${afterRest.replace(/^\s+/, "")}`;
  const newPos = prefix.length + insertion.length;
  el.input.setSelectionRange(newPos, newPos);
  hideAtSuggestions();
  resizeComposerInput();
  el.input.focus();
}

function renderAtSuggestions() {
  const ctx = currentAtQuery();
  if (!ctx) {
    hideAtSuggestions();
    return;
  }
  const { query } = ctx;
  state.mentionQuery = query;
  const fetchId = ++mentionFetchId;
  if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer);
  const delay = query.length <= 1 ? 35 : 90;
  mentionDebounceTimer = setTimeout(async () => {
    let results = [];
    try {
      const liveApi = window.piDesktop || api;
      if (liveApi && typeof liveApi.searchFiles === "function") {
        results = await liveApi.searchFiles(query);
      }
    } catch {
      results = [];
    }
    if (fetchId !== mentionFetchId) return;
    const still = currentAtQuery();
    if (!still || still.query !== query) return;
    state.mentionResults = Array.isArray(results) ? results : [];
    state.atSelection = Math.max(0, Math.min(state.atSelection || 0, state.mentionResults.length - 1));
    if (!state.mentionResults.length) {
      hideAtSuggestions();
      return;
    }
    if (!el.atSuggestions) return;
    el.atSuggestions.innerHTML = "";
    state.mentionResults.forEach((candidate, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slash-suggestion at-suggestion${index === state.atSelection ? " active" : ""}`;
      button.setAttribute("role", "option");
      const iconName = candidate.dir ? "folder" : "file";
      const safePath = escapeHtml(candidate.path);
      const displayPath = candidate.dir ? `${safePath}/` : safePath;
      button.innerHTML = `<span class="command-name">${icon(iconName)}<span>${displayPath}</span></span>` +
        `<span class="command-description">${candidate.dir ? "cartella" : "file"}</span>` +
        `<span class="source-badge">${candidate.dir ? "dir" : "file"}</span>`;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => applyAtSuggestion(candidate));
      el.atSuggestions.appendChild(button);
    });
    el.atSuggestions.classList.remove("hidden");
    if (el.slashSuggestions) el.slashSuggestions.classList.add("hidden");
    refreshIcons();
  }, delay);
}

function syncAtSelection() {
  if (!el.atSuggestions) return;
  const buttons = el.atSuggestions.querySelectorAll(".at-suggestion");
  buttons.forEach((btn, idx) => btn.classList.toggle("active", idx === state.atSelection));
}

// Expose for bootstrap and tests
if (typeof window !== "undefined") {
  window.piMentions = {
    currentAtQuery,
    renderAtSuggestions,
    hideAtSuggestions,
    applyAtSuggestion,
    syncAtSelection,
  };
  // legacy globals for bootstrap fallback
  window.currentAtQuery = currentAtQuery;
  window.renderAtSuggestions = renderAtSuggestions;
  window.hideAtSuggestions = hideAtSuggestions;
  window.applyAtSuggestion = applyAtSuggestion;
  window.syncAtSelection = syncAtSelection;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { currentAtQuery, renderAtSuggestions, hideAtSuggestions, applyAtSuggestion };
}
})();
