"use strict";
// Palette + slash – extracted from app.js monolith. Loaded before app.js, globals shared.

async function openCommandPalette() {
  el.commandSearch.value = "";
  el.commandList.innerHTML = `<div class="menu-empty">Caricamento comandi…</div>`;
  el.modalCommands.showModal();
  setTimeout(() => el.commandSearch.focus(), 40);
  try {
    await ensureCommands();
    state.commandSelection = 0;
    renderCommandPalette();
  } catch (err) {
    el.commandList.innerHTML = `<div class="menu-empty">${escapeHtml(err.message)}</div>`;
  }
}

async function ensureCommands(force = false) {
  if (!force && state.commands.length) return state.commands;
  if (!force && state.commandsLoading) return state.commandsLoading;
  state.commandsLoading = api.getCommands()
    .then((data) => {
      state.commands = data.commands || [];
      return state.commands;
    })
    .finally(() => { state.commandsLoading = null; });
  return state.commandsLoading;
}

function filteredCommands() {
  const query = el.commandSearch.value.toLowerCase().trim();
  return state.commands
    .filter((command) => !query || `${command.name} ${command.description || ""} ${command.source}`.toLowerCase().includes(query))
    .sort((a, b) => commandUsageScore(b.name) - commandUsageScore(a.name) || a.name.localeCompare(b.name));
}

function renderCommandPalette() {
  const commands = filteredCommands();
  state.commandSelection = Math.max(0, Math.min(state.commandSelection, commands.length - 1));
  el.commandList.innerHTML = "";
  if (!commands.length) {
    el.commandList.innerHTML = `<div class="menu-empty">Nessun comando disponibile.</div>`;
    return;
  }
  commands.forEach((command, index) => {
    const button = document.createElement("button");
    button.className = `command-item${index === state.commandSelection ? " active" : ""}`;
    button.innerHTML = `<span class="command-name">/${escapeHtml(command.name)}</span>` +
      `<span class="command-description">${escapeHtml(command.description || "Nessuna descrizione")}</span>` +
      `<span class="source-badge">${escapeHtml(command.source)}</span>`;
    button.addEventListener("click", () => chooseCommand(command));
    el.commandList.appendChild(button);
  });
}

function chooseCommand(command) {
  recordCommandUsage(command.name);
  const prefix = `/${command.name}`;
  el.input.value = `${prefix} `;
  autosize();
  el.modalCommands.close();
  el.input.focus();
  el.input.setSelectionRange(el.input.value.length, el.input.value.length);
}

function currentSlashQuery() {
  const cursor = el.input.selectionStart;
  if (cursor !== el.input.selectionEnd) return null;
  const before = el.input.value.slice(0, cursor);
  const after = el.input.value.slice(cursor);
  const match = before.match(/^\/([^\s]*)$/);
  if (!match || (after && !/^\s*$/.test(after))) return null;
  return match[1].toLowerCase();
}

function slashMatches() {
  const query = currentSlashQuery();
  if (query == null) return [];
  return state.commands
    .filter((command) => !query || `${command.name} ${command.description || ""}`.toLowerCase().includes(query))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(query) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(query) ? 0 : 1;
      return aPrefix - bPrefix || commandUsageScore(b.name) - commandUsageScore(a.name) || a.name.localeCompare(b.name);
    })
    .slice(0, 12);
}

async function renderSlashSuggestions() {
  if (currentSlashQuery() == null) return hideSlashSuggestions();
  try { await ensureCommands(); } catch { return hideSlashSuggestions(); }
  const commands = slashMatches();
  state.slashSelection = Math.max(0, Math.min(state.slashSelection, commands.length - 1));
  el.slashSuggestions.innerHTML = "";
  if (!commands.length) return hideSlashSuggestions();
  commands.forEach((command, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slash-suggestion${index === state.slashSelection ? " active" : ""}`;
    button.setAttribute("role", "option");
    button.innerHTML = `<span class="command-name">/${escapeHtml(command.name)}</span>` +
      `<span class="command-description">${escapeHtml(command.description || "")}</span>` +
      `<span class="source-badge">${escapeHtml(command.source)}</span>`;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applySlashSuggestion(command));
    el.slashSuggestions.appendChild(button);
  });
  el.slashSuggestions.classList.remove("hidden");
}

function hideSlashSuggestions() {
  el.slashSuggestions.classList.add("hidden");
  el.slashSuggestions.innerHTML = "";
}

function applySlashSuggestion(command) {
  recordCommandUsage(command.name);
  const cursor = el.input.selectionStart;
  const suffix = el.input.value.slice(cursor).replace(/^\s*/, "");
  el.input.value = `/${command.name} ${suffix}`;
  const position = command.name.length + 2;
  el.input.setSelectionRange(position, position);
  hideSlashSuggestions();
  autosize();
  el.input.focus();
}

