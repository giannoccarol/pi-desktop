"use strict";
// Auth + provider settings + native Pi settings — extracted from app.js monolith.
// Loaded before bootstrap/app. Exposes window.piAuth and global delegations.
(function () {
  const api = window.piDesktop;
  const el = window.piStore ? window.piStore.el : {};
  const state = window.piStore ? window.piStore.state : {};
  function t(k, v) { return window.i18n ? window.i18n.t(k, v) : String(k); }
  function toast(m, k, ms) { return window.piUi ? window.piUi.toast(m, k, ms) : void 0; }
  function escapeHtml(s) { return window.piUtils ? window.piUtils.escapeHtml(s) : String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function refreshIcons() { return window.piUi ? window.piUi.refreshIcons() : void 0; }
  function refreshHeaderFromState() {
    if (window.piModels && window.piModels.refreshHeaderFromState) return window.piModels.refreshHeaderFromState.apply(null, arguments);
    if (window.refreshHeaderFromState) return window.refreshHeaderFromState.apply(null, arguments);
  }

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

  function resetAuthPrompt() {
    el.authOptions.innerHTML = "";
    el.authOptions.classList.add("hidden");
    el.authInputWrap.classList.add("hidden");
    el.authOk.classList.add("hidden");
    el.authInput.value = "";
    el.authInput.type = "text";
  }

  function authEventText(event) {
    if (event.type === "auth_url") return `${event.instructions || "Completa l’accesso nel browser."}\n${event.url}`;
    if (event.type === "device_code") return `Apri ${event.verificationUri} e inserisci il codice:\n${event.userCode}`;
    return event.message || "Accesso in corso…";
  }

  function respondToAuthPrompt(value, cancelled = false) {
    const requestId = state.authFlow?.requestId;
    if (!requestId) return;
    state.authFlow.requestId = null;
    resetAuthPrompt();
    api.authRespond(requestId, value, cancelled).catch(() => {});
    if (!cancelled) el.authStatus.innerHTML = `<span class="muted">Verifica in corso…</span>`;
  }

  if (api && api.on) {
    api.on("pi:auth-request", (message) => {
      if (!state.authFlow || message.providerId !== state.authFlow.providerId) return;
      if (message.kind === "event") {
        el.authStatus.textContent = authEventText(message.event || {});
        return;
      }
      if (message.kind === "error") {
        el.authStatus.innerHTML = `<span style="color:var(--red)">${escapeHtml(message.error || "Accesso fallito")}</span>`;
        return;
      }
      if (message.kind !== "prompt") return;
      resetAuthPrompt();
      state.authFlow.requestId = message.id;
      const prompt = message.prompt || {};
      el.authStatus.textContent = prompt.message || "Inserisci le informazioni richieste.";
      if (prompt.type === "select") {
        el.authOptions.classList.remove("hidden");
        for (const option of prompt.options || []) {
          const button = document.createElement("button");
          button.className = "btn ghost auth-option";
          button.innerHTML = `<strong>${escapeHtml(option.label)}</strong>${option.description ? `<span class="muted small">${escapeHtml(option.description)}</span>` : ""}`;
          button.addEventListener("click", () => respondToAuthPrompt(option.id));
          el.authOptions.appendChild(button);
        }
      } else {
        el.authInputWrap.classList.remove("hidden");
        el.authInputLabel.textContent = prompt.message || "Valore";
        el.authInput.placeholder = prompt.placeholder || "";
        el.authInput.type = prompt.type === "secret" ? "password" : "text";
        el.authOk.classList.remove("hidden");
        el.authOk.onclick = () => respondToAuthPrompt(el.authInput.value);
        setTimeout(() => el.authInput.focus(), 40);
      }
    });
  }

  async function loadNativePiSettings() {
    el.settingsRuntime.classList.add("loading");
    try {
      const data = await api.getPiSettings();
      const settings = data.effective || {};
      el.projectTrust.value = data.trust?.exact === true ? "true" : data.trust?.exact === false ? "false" : "inherit";
      el.defaultTrust.value = settings.defaultProjectTrust || "ask";
      el.transport.value = settings.transport || "auto";
      el.enabledModels.value = (settings.enabledModels || []).join(", ");
      const tools = Array.isArray(settings.defaultTools) ? settings.defaultTools : ["read", "bash", "edit", "write"];
      for (const checkbox of el.nativeTools) checkbox.checked = tools.includes(checkbox.value);
      el.shellPath.value = settings.shellPath || "";
      el.shellPrefix.value = settings.shellCommandPrefix || "";
      el.compactEnabled.checked = settings.compaction?.enabled !== false;
      el.compactReserve.value = settings.compaction?.reserveTokens ?? 16384;
      el.compactKeep.value = settings.compaction?.keepRecentTokens ?? 20000;
      el.retryEnabled.checked = settings.retry?.enabled !== false;
      el.retryMax.value = settings.retry?.maxRetries ?? 3;
      el.retryDelay.value = settings.retry?.baseDelayMs ?? 2000;
      el.imageResize.checked = settings.images?.autoResize !== false;
      el.blockImages.checked = settings.images?.blockImages === true;
      const trust = data.trust || {};
      const effective = trust.effective === true ? "attendibile" : trust.effective === false ? "non attendibile" : "nessuna decisione salvata";
      const inherited = trust.inheritedPath && trust.inheritedPath !== state.settings.cwd ? `, ereditata da ${trust.inheritedPath}` : "";
      el.projectTrustNote.textContent = trust.hasResources
        ? `Il progetto contiene risorse Pi soggette a trust. Decisione effettiva: ${effective}${inherited}.`
        : `Il progetto non contiene attualmente risorse locali soggette a trust. Decisione effettiva: ${effective}${inherited}.`;
    } catch (err) {
      el.projectTrustNote.textContent = `Impossibile leggere le impostazioni Pi: ${err.message}`;
    } finally {
      el.settingsRuntime.classList.remove("loading");
    }
  }

  async function saveNativePiSettings() {
    const trustDecision = el.projectTrust.value === "true" ? true : el.projectTrust.value === "false" ? false : null;
    const patch = {
      defaultProjectTrust: el.defaultTrust.value,
      transport: el.transport.value,
      enabledModels: el.enabledModels.value.split(","),
      defaultTools: [...el.nativeTools].filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value),
      shellPath: el.shellPath.value,
      shellCommandPrefix: el.shellPrefix.value,
      compaction: {
        enabled: el.compactEnabled.checked,
        reserveTokens: el.compactReserve.value,
        keepRecentTokens: el.compactKeep.value,
      },
      retry: {
        enabled: el.retryEnabled.checked,
        maxRetries: el.retryMax.value,
        baseDelayMs: el.retryDelay.value,
      },
      images: {
        autoResize: el.imageResize.checked,
        blockImages: el.blockImages.checked,
      },
    };
    el.piSettingsSave.disabled = true;
    try {
      await api.savePiSettings(patch, trustDecision);
      state.autoRetryEnabled = el.retryEnabled.checked;
      state.modelsCache = null;
      state.commands = [];
      toast("Impostazioni native Pi salvate; runtime ricaricato.");
      await refreshHeaderFromState();
      await loadNativePiSettings();
    } catch (err) {
      toast(`Salvataggio impostazioni Pi fallito: ${err.message}`, "error", 8000);
    } finally {
      el.piSettingsSave.disabled = false;
    }
  }

  function switchSettingsTab(tab) {
    for (const button of el.settingsTabs) {
      button.classList.toggle("active", button.dataset.settingsTab === tab);
    }
    el.settingsGeneral.classList.toggle("hidden", tab !== "general");
    el.settingsRuntime.classList.toggle("hidden", tab !== "runtime");
    el.settingsProviders.classList.toggle("hidden", tab !== "providers");
    el.btnSettingsSave.classList.toggle("hidden", tab !== "general");
    if (tab === "providers") loadProviderSettings();
    if (tab === "runtime") loadNativePiSettings();
  }

  function renderProviderSettings() {
    const q = (el.providerSettingsSearch.value || "").toLowerCase().trim();
    const providers = state.providers.filter((provider) =>
      `${provider.name} ${provider.id} ${provider.envVar} ${provider.hint}`.toLowerCase().includes(q)
    );
    el.providerSettingsList.innerHTML = "";
    if (!providers.length) {
      el.providerSettingsList.innerHTML = `<div class="menu-empty">Nessun provider trovato.</div>`;
      return;
    }
    for (const provider of providers) {
      const card = document.createElement("article");
      card.className = "provider-card";
      card.dataset.provider = provider.id;
      const authTypes = provider.authTypes || [];
      const canUseApiKey = Boolean(provider.envVar) && !provider.oauthOnly;
      const connectionHelp = provider.credentialType === "oauth"
          ? "Salvando una key sostituirai l’accesso OAuth."
          : provider.credentialType === "environment"
            ? `La variabile ${escapeHtml(provider.envVar)} è disponibile nel processo. Puoi sovrascriverla con una chiave locale.`
            : "La configurazione guidata usa direttamente il sistema di autenticazione di Pi.";
      const nativeAuthControls = authTypes.length
        ? `<div class="native-auth-actions">` +
          `${authTypes.includes("oauth") ? `<button class="btn primary provider-native-login" data-auth-type="oauth">${escapeHtml(provider.oauthLabel || provider.oauthName || "Accedi con OAuth")}</button>` : ""}` +
          `${authTypes.includes("api_key") ? `<button class="btn ghost provider-native-login" data-auth-type="api_key">Configura ${escapeHtml(provider.apiKeyName || "API key")}</button>` : ""}` +
          `</div>`
        : "";
      const apiKeyControls = canUseApiKey
        ? `<label>${escapeHtml(provider.envVar)}</label>` +
          `<div class="provider-key-row"><input class="provider-key" type="password" maxlength="20000" autocomplete="off" placeholder="Incolla la API key" />` +
          `<button class="btn primary provider-save">Salva</button></div>`
        : "";
      card.innerHTML =
        `<div class="provider-card-head">` +
        `<span class="provider-avatar">${escapeHtml(provider.name.slice(0, 2).toUpperCase())}</span>` +
        `<span class="provider-card-copy"><strong>${escapeHtml(provider.name)}</strong>` +
        `<small class="${provider.configured ? "provider-status" : ""}">${provider.configured ? escapeHtml(provider.masked || "Configurato") : escapeHtml(provider.hint)}</small></span>` +
        `<button class="btn ghost provider-connect">${provider.configured ? "Gestisci" : "Connetti"}</button>` +
        `</div>` +
        `<div class="provider-config hidden">` +
        nativeAuthControls +
        apiKeyControls +
        `<div class="provider-card-actions"><span class="muted small">${connectionHelp}</span>` +
        `${provider.removable ? '<button class="btn ghost small provider-remove">Disconnetti</button>' : ""}</div>` +
        `</div>`;
      const config = card.querySelector(".provider-config");
      card.querySelector(".provider-connect").addEventListener("click", () => {
        config.classList.toggle("hidden");
        if (!config.classList.contains("hidden")) card.querySelector(".provider-key")?.focus();
      });
      card.querySelector(".provider-save")?.addEventListener("click", async () => {
        const keyInput = card.querySelector(".provider-key");
        try {
          state.providers = await api.setProviderKey(provider.id, keyInput.value);
          state.modelsCache = null;
          toast(`${provider.name} configurato. Runtime di pi aggiornato.`);
          renderProviderSettings();
        } catch (err) {
          toast(`Configurazione fallita: ${err.message}`, "error");
        } finally {
          keyInput.value = "";
        }
      });
      for (const loginButton of card.querySelectorAll(".provider-native-login")) {
        loginButton.addEventListener("click", () => startProviderLogin(provider, loginButton.dataset.authType));
      }
      card.querySelector(".provider-remove")?.addEventListener("click", async () => {
        if (!confirm(`Disconnettere ${provider.name}? La credenziale verrà rimossa da auth.json.`)) return;
        try {
          state.providers = await api.removeProvider(provider.id);
          state.modelsCache = null;
          toast(`${provider.name} disconnesso.`);
          renderProviderSettings();
        } catch (err) {
          toast(`Disconnessione fallita: ${err.message}`, "error");
        }
      });
      el.providerSettingsList.appendChild(card);
    }
  }

  const apiExport = {
    loadProviderSettings, startProviderLogin, resetAuthPrompt, authEventText, respondToAuthPrompt,
    loadNativePiSettings, saveNativePiSettings, switchSettingsTab, renderProviderSettings,
  };
  window.piAuth = apiExport;
  // backward compat globals for wireUi/bootstrap
  window.loadProviderSettings = loadProviderSettings;
  window.startProviderLogin = startProviderLogin;
  window.resetAuthPrompt = resetAuthPrompt;
  window.authEventText = authEventText;
  window.respondToAuthPrompt = respondToAuthPrompt;
  window.loadNativePiSettings = loadNativePiSettings;
  window.saveNativePiSettings = saveNativePiSettings;
  window.switchSettingsTab = switchSettingsTab;
  window.renderProviderSettings = renderProviderSettings;
  if (typeof module !== "undefined" && module.exports) module.exports = apiExport;
})();
