"use strict";
// Extracted from app.js: models/providers/thinking
(function(){ const api=window.piDesktop; const el=window.piStore.el; const state=window.piStore.state; const t=window.i18n?window.i18n.t:(k,v)=>k; function toast(m,k,ms){return window.piUi.toast(m,k,ms);} function escapeHtml(s){return window.piUtils.escapeHtml(s);} function icon(n){return window.piUi.icon(n);} function refreshIcons(){return window.piUi.refreshIcons();}
async function loadModels(force = false) {
  const now = Date.now();
  if (!force && state.modelsCache && now - state.modelsCacheAt < 60000) return state.modelsCache;
  const data = await api.getAvailableModels();
  state.modelsCache = data.models || [];
  state.modelsCacheAt = now;
  return state.modelsCache;
}

function renderModelMenu(filter) {
  const models = state.modelsCache || [];
  const f = (filter || "").toLowerCase().trim();
  el.modelList.innerHTML = "";
  if (!models.length) {
    el.modelList.innerHTML = `<div class="menu-empty">Nessun modello disponibile.<br/>
    <span class="small">Configura le API key (env o <code>~/.pi/agent</code>) e riapri.</span></div>`;
    return;
  }
  const currentProvider = state.currentModel?.provider;
  const list = models.filter((m) => {
    if (currentProvider && m.provider !== currentProvider) return false;
    return !f || `${m.provider}/${m.id} ${m.name || ""}`.toLowerCase().includes(f);
  });
  if (!list.length) {
    el.modelList.innerHTML = `<div class="menu-empty">Nessuna corrispondenza.</div>`;
    return;
  }
  const lbl = document.createElement("div");
  lbl.className = "menu-group-label";
  lbl.textContent = currentProvider || "Modelli";
  el.modelList.appendChild(lbl);
  for (const m of list) {
    const item = document.createElement("div");
    const selected = state.currentModel && state.currentModel.provider === m.provider && state.currentModel.id === m.id;
    item.className = "menu-item" + (selected ? " selected" : "");
    item.innerHTML = `<span class="mi-name">${escapeHtml(m.name || m.id)}</span>` +
      `<span class="mi-sub mono">${escapeHtml(m.id)}</span>`;
    item.addEventListener("click", async () => {
      try {
        await api.setModel(m.provider, m.id);
        state.currentModel = { provider: m.provider, id: m.id };
        updateModelLabel();
        renderModelMenu(el.modelSearch.value);
        closeMenus();
        toast(`Modello: ${m.provider}/${m.id}`);
      } catch (err) {
        toast(`Cambio modello fallito: ${err.message}`, "error");
      }
    });
    el.modelList.appendChild(item);
  }
}

function renderProviderMenu() {
  const providers = new Map();
  for (const model of state.modelsCache || []) {
    if (!providers.has(model.provider)) providers.set(model.provider, []);
    providers.get(model.provider).push(model);
  }
  el.providerList.innerHTML = "";
  if (!providers.size) {
    el.providerList.innerHTML = `<div class="menu-empty">Nessun provider configurato.</div>`;
    return;
  }
  for (const [provider, models] of providers) {
    const item = document.createElement("div");
    item.className = "menu-item" + (state.currentModel?.provider === provider ? " selected" : "");
    item.innerHTML = `<span class="mi-name">${escapeHtml(provider)}</span><span class="mi-sub">${models.length} modelli</span>`;
    item.addEventListener("click", async () => {
      if (state.currentModel?.provider === provider) {
        closeMenus();
        return;
      }
      const target = models[0];
      try {
        await api.setModel(target.provider, target.id);
        state.currentModel = { provider: target.provider, id: target.id };
        updateModelLabel();
        renderProviderMenu();
        closeMenus();
        toast(`Provider: ${provider} · ${target.name || target.id}`);
      } catch (err) {
        toast(`Cambio provider fallito: ${err.message}`, "error");
      }
    });
    el.providerList.appendChild(item);
  }
}

function updateModelLabel() {
  const m = state.currentModel;
  const details = m && (state.modelsCache || []).find((candidate) => candidate.provider === m.provider && candidate.id === m.id);
  el.providerLabel.textContent = m?.provider || "scegli provider";
  el.modelLabel.textContent = m ? (details?.name || m.id) : "scegli modello";
}

async function refreshHeaderFromState() {
  try {
    const st = await api.getState();
    state.currentModel = st.model ? { provider: st.model.provider, id: st.model.id } : null;
    await loadModels().catch(() => []);
    updateModelLabel();
    if (st.sessionFile) state.activeSessionFile = st.sessionFile;
    if (st.thinkingLevel) el.thinkingLabel.textContent = st.thinkingLevel;
    await refreshThinkingLevels();
  } catch {}
}

async function refreshThinkingLevels() {
  try {
    const data = await api.getThinkingLevels();
    const levels = (data && data.levels) || ["off"];
    state.thinkingLevels = levels;
    el.thinkingList.innerHTML = "";
    for (const lvl of levels) {
      const item = document.createElement("div");
      item.className = "menu-item" + (el.thinkingLabel.textContent === lvl ? " selected" : "");
      item.innerHTML = `<span class="mi-name">${lvl}</span>`;
      item.addEventListener("click", async () => {
        try {
          await api.setThinkingLevel(lvl);
          el.thinkingLabel.textContent = lvl;
          renderThinkingMenu();
          closeMenus();
        } catch (err) {
          toast(err.message, "error");
        }
      });
      el.thinkingList.appendChild(item);
    }
    el.thinkingDropdown.style.display = levels.length <= 1 ? "none" : "";
  } catch {}
}

function renderThinkingMenu() {
  for (const item of el.thinkingList.children) {
    item.classList.toggle("selected", item.textContent.trim() === el.thinkingLabel.textContent.trim());
  }
}

function closeMenus(){ return window.piUi.closeMenus(); }
function setSidebarVisible(v){ return window.piUi.setSidebarVisible(v); }
function applyTheme(th){ return window.piUi.applyTheme(th); }

async function loadProviderSettings() {
  try {
    state.providers = await api.listProviders();
    renderProviderSettings();
  } catch (err) {
    el.providerSettingsList.innerHTML = `<div class="menu-empty">Impossibile leggere i provider: ${escapeHtml(err.message)}</div>`;
  }
}

async function startProviderLogin(provider, authType) {
  state.authFlow = { providerId: provider.id, providerName: provider.name, authType, requestId: null };
  el.authTitle.textContent = `Accedi a ${provider.name}`;
  el.authSubtitle.textContent = authType === "oauth" ? "Accesso OAuth gestito nativamente da Pi." : "Configurazione credenziale gestita nativamente da Pi.";
  el.authStatus.innerHTML = `<span class="muted">Avvio procedura…</span>`;
  resetAuthPrompt();
  el.modalAuth.showModal();
  try {
    state.providers = await api.loginProvider(provider.id, authType);
    state.modelsCache = null;
    renderProviderSettings();
    toast(`${provider.name} configurato.`);
    el.modalAuth.close();
  } catch (err) {
    if (!/annullato/i.test(err.message)) toast(`Accesso fallito: ${err.message}`, "error", 8000);
  } finally {
    state.authFlow = null;
  }
}

window.loadModels=loadModels; window.renderModelMenu=renderModelMenu; window.renderProviderMenu=renderProviderMenu; window.updateModelLabel=updateModelLabel; window.refreshHeaderFromState=refreshHeaderFromState; window.refreshThinkingLevels=refreshThinkingLevels; window.renderThinkingMenu=renderThinkingMenu; window.piModels={loadModels,renderModelMenu,renderProviderMenu,updateModelLabel,refreshHeaderFromState,refreshThinkingLevels,renderThinkingMenu};
})();
