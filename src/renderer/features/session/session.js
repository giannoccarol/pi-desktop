"use strict";
// Session / tree – extracted from app.js monolith. Loaded before app.js, globals shared.

function treeEntryDescription(entry) {
  if (!entry) return { role: "voce", text: "" };
  if (entry.type === "message") {
    const role = entry.message?.role || "messaggio";
    return { role, text: truncate(textOfBlocks(entry.message?.content).replace(/\s+/g, " ").trim(), 180) || `[${role}]` };
  }
  if (entry.type === "compaction") return { role: "compact", text: truncate(entry.summary || "Compattazione del contesto", 180) };
  if (entry.type === "branch_summary") return { role: "riepilogo", text: truncate(entry.summary || "Riepilogo ramo", 180) };
  if (entry.type === "session_info") return { role: "sessione", text: entry.name || "Informazioni sessione" };
  if (entry.type === "model_change") return { role: "modello", text: `${entry.provider || ""}/${entry.modelId || ""}` };
  if (entry.type === "thinking_level_change") return { role: "thinking", text: entry.thinkingLevel || "" };
  return { role: entry.type || "voce", text: entry.label || entry.type || "Voce sessione" };
}

function flattenTree(nodes, depth = 0, output = []) {
  for (const node of nodes || []) {
    output.push({ node, depth });
    flattenTree(node.children, depth + 1, output);
  }
  return output;
}

async function loadSessionTree() {
  el.treeList.innerHTML = `<div class="menu-empty">Caricamento albero…</div>`;
  try {
    const [data, forkData] = await Promise.all([api.getTree(), api.getForkMessages()]);
    const forkIds = new Set((forkData.messages || []).map((message) => message.entryId));
    const flat = flattenTree(data.tree || []);
    el.treeSummary.textContent = `${flat.length} voci · ${forkIds.size} punti di fork`;
    el.treeList.innerHTML = "";
    if (!flat.length) {
      el.treeList.innerHTML = `<div class="menu-empty">La sessione è ancora vuota.</div>`;
      return;
    }
    for (const { node, depth } of flat) {
      const entry = node.entry || {};
      const description = treeEntryDescription(entry);
      const row = document.createElement("div");
      row.className = `tree-node${entry.id === data.leafId ? " active" : ""}`;
      row.style.paddingLeft = `${10 + depth * 18}px`;
      row.innerHTML = `${depth ? '<span class="tree-rail"></span>' : ""}` +
        `<span class="tree-role">${escapeHtml(description.role)}</span>` +
        `<span class="tree-text"></span><span class="tree-id">${escapeHtml(String(entry.id || "").slice(0, 8))}</span>`;
      row.querySelector(".tree-text").textContent = node.label || description.text;
      if (forkIds.has(entry.id)) {
        const forkButton = document.createElement("button");
        forkButton.className = "btn ghost tree-fork";
        forkButton.innerHTML = `${icon("git-fork")} Fork`;
        forkButton.addEventListener("click", () => forkFromEntry(entry.id));
        row.appendChild(forkButton);
      }
      el.treeList.appendChild(row);
    }
    refreshIcons();
  } catch (err) {
    el.treeList.innerHTML = `<div class="menu-empty">Albero non disponibile.<br><span class="small">${escapeHtml(err.message)}</span></div>`;
  }
}

async function openSessionTree() {
  el.modalTree.showModal();
  await loadSessionTree();
}

async function forkFromEntry(entryId) {
  try {
    const result = await api.fork(entryId);
    if (result.cancelled) return toast("Fork annullato da un’estensione.", "warn");
    el.modalTree.close();
    await reloadConversationFromRuntime();
    el.input.value = result.text || "";
    autosize();
    el.input.focus();
    toast("Nuovo fork creato. Puoi modificare il prompt originale.");
  } catch (err) {
    toast(`Fork fallito: ${err.message}`, "error");
  }
}

async function cloneActiveSession() {
  try {
    const result = await api.clone();
    if (result.cancelled) return toast("Clonazione annullata da un’estensione.", "warn");
    el.modalTree.close();
    await reloadConversationFromRuntime();
    toast("Ramo attivo clonato in una nuova sessione.");
  } catch (err) {
    toast(`Clonazione fallita: ${err.message}`, "error");
  }
}

async function newChildSession() {
  try {
    const current = await api.getState();
    const parentSession = current.sessionFile || state.activeSessionFile;
    if (!parentSession) return toast("Invia almeno un messaggio prima di creare una sessione figlia.", "warn");
    el.modalTree.close();
    await newChat(state.settings?.cwd, parentSession);
    toast("Nuova sessione collegata alla sessione precedente.");
  } catch (err) {
    toast(`Creazione sessione figlia fallita: ${err.message}`, "error");
  }
}

async function openSessionTools() {
  try {
    const current = await api.getState();
    el.sessionNameInput.value = current.sessionName || "";
    el.steeringMode.value = current.steeringMode || "one-at-a-time";
    el.followUpMode.value = current.followUpMode || "one-at-a-time";
    el.autoCompaction.checked = current.autoCompactionEnabled !== false;
    el.autoRetry.checked = state.autoRetryEnabled;
    el.modalSessionTools.showModal();
  } catch (err) {
    toast(`Stato sessione non disponibile: ${err.message}`, "error");
  }
}

async function renameSession() {
  try {
    await api.setSessionName(el.sessionNameInput.value.trim());
    await refreshSessions();
    toast("Nome sessione aggiornato.");
  } catch (err) {
    toast(`Rinomina fallita: ${err.message}`, "error");
  }
}

async function compactSession() {
  el.compactBtn.disabled = true;
  try {
    const result = await api.compact(el.compactInstructions.value.trim() || undefined);
    const before = result.tokensBefore != null ? fmtTokens(result.tokensBefore) : "?";
    const after = result.estimatedTokensAfter != null ? fmtTokens(result.estimatedTokensAfter) : "?";
    toast(`Contesto compattato: ${before} → circa ${after} token.`, "info", 6500);
    await reloadConversationFromRuntime();
  } catch (err) {
    toast(`Compattazione fallita: ${err.message}`, "error", 8000);
  } finally {
    el.compactBtn.disabled = false;
  }
}

async function newChat(projectPath = state.settings?.cwd, parentSession = null) {
  if (state.creatingChat) return;
  stashActiveTabContext();
  state.creatingChat = true;
  document.body.classList.add("session-loading");
  el.newChat?.setAttribute("disabled", "true");
  el.topNewChat?.setAttribute("disabled", "true");
  try {
    resetQueueState();
    setBusy(false);
    clearChat();
    setConversationMode(false);
    state.attachments = [];
    renderAttachmentTray();
    if (projectPath && projectPath !== state.settings?.cwd) {
      state.settings = await api.activateProject(projectPath);
    }
    if (projectPath) state.expandedProjects.add(projectPath);
    const created = await api.newSession(projectPath, parentSession);
    state.commands = [];
    state.activeTabId = created.tabId || state.activeTabId;
    state.activeSessionFile = null;
    state.tabContexts.set(state.activeTabId, { input: "", attachments: [], queueBehavior: "followUp", localQueue: [], scrollState: null });
    el.emptyState.classList.remove("hidden");
    el.statusCwd.textContent = projectPath || state.settings?.cwd || "";
    await refreshTabs();
    renderProjects();
    refreshHeaderFromState();
    el.input.focus();
  } catch (err) {
    toast(`Nuova chat non riuscita: ${err.message}`, "error");
  } finally {
    state.creatingChat = false;
    document.body.classList.remove("session-loading");
    el.newChat?.removeAttribute("disabled");
    el.topNewChat?.removeAttribute("disabled");
    renderProjects();
  }
}

window.piSession = {
  loadSessionTree,
  openSessionTree,
  forkFromEntry,
  cloneActiveSession,
  newChildSession,
  openSessionTools,
  renameSession,
  compactSession,
  newChat,
};
window.newChat = newChat;
if (typeof module !== "undefined" && module.exports) module.exports = window.piSession;
