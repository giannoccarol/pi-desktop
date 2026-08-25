"use strict";
// Bootstrap — wireUi + boot extracted from app.js monolith.
// Loaded after all other renderer modules, before app.js
(function () {
  const api = window.piDesktop;
  const el = window.piStore ? window.piStore.el : {};
  const state = window.piStore ? window.piStore.state : {};
  const i18n = window.i18n;
  function t(k, v) { return i18n ? i18n.t(k, v) : String(k); }

  // helpers resolved at call-time via window to avoid ordering issues
  function toast() { return (window.piUi ? window.piUi.toast : window.toast)?.apply(null, arguments); }
  function refreshIcons() { return (window.piUi ? window.piUi.refreshIcons : window.refreshIcons)?.apply(null, arguments); }
  function icon(n) { return (window.piUi ? window.piUi.icon : window.icon)?.apply(null, arguments); }
  function escapeHtml(s) { return (window.piUtils ? window.piUtils.escapeHtml : window.escapeHtml)?.apply(null, arguments) ?? String(s ?? ""); }
  function scheduleScrollVisibility() { return (window.piUi ? window.piUi.scheduleScrollVisibility : window.scheduleScrollVisibility)?.apply(null, arguments); }
  function updateScrollBottomVisibility() { return (window.piUi ? window.piUi.updateScrollBottomVisibility : window.updateScrollBottomVisibility)?.apply(null, arguments); }
  function jumpToBottom() { return (window.piUi ? window.piUi.jumpToBottom : window.jumpToBottom)?.apply(null, arguments); }
  function setConversationMode(a,b){ return (window.piUi ? window.piUi.setConversationMode : window.setConversationMode)?.apply(null, arguments); }
  function closeMenus(){ return (window.piUi ? window.piUi.closeMenus : window.closeMenus)?.apply(null, arguments); }
  function setSidebarVisible(v){ return (window.piUi ? window.piUi.setSidebarVisible : window.setSidebarVisible)?.apply(null, arguments); }
  function applyTheme(th){ return (window.piUi ? window.piUi.applyTheme : window.applyTheme)?.apply(null, arguments); }

  function getUiRequest() {
    if (window.piExtensionBridge && window.piExtensionBridge.getUiRequest) return window.piExtensionBridge.getUiRequest();
    return window.uiRequest;
  }

  function wireUi() {
    // these are global sidebars fns
    if (typeof initSidebarResize === "function") initSidebarResize();
    else if (window.initSidebarResize) window.initSidebarResize();
    if (typeof initChatTooltip === "function") initChatTooltip();
    else if (window.initChatTooltip) window.initChatTooltip();
    if (typeof initSearchEnhancement === "function") initSearchEnhancement();
    else if (window.initSearchEnhancement) window.initSearchEnhancement();
    if (el.chat) {
      el.chat.addEventListener("scroll", scheduleScrollVisibility, { passive: true });
      window.addEventListener("resize", scheduleScrollVisibility);
    }
    if (el.btnScrollBottom) {
      el.btnScrollBottom.addEventListener("click", () => {
        state.chatStickToBottom = true;
        try {
          el.chat.scrollTo({ top: el.chat.scrollHeight, behavior: "smooth" });
        } catch {
          jumpToBottom();
        }
        queueMicrotask(updateScrollBottomVisibility);
      });
    }
    el.sendBtn.addEventListener("click", () => (window.sendMessage||window.piComposer?.sendMessage||function(){} )());
    el.stopBtn.addEventListener("click", () => (window.abortCurrentWork||window.piComposer?.abortCurrentWork||function(){} )());
    el.input.addEventListener("keydown", (e) => {
      if (!el.slashSuggestions.classList.contains("hidden")) {
        const commands = (window.slashMatches||window.piPalette?.slashMatches||function(){return []})()
        const render = window.renderSlashSuggestions||window.piPalette?.renderSlashSuggestions
        const apply = window.applySlashSuggestion||window.piPalette?.applySlashSuggestion
        const hide = window.hideSlashSuggestions||window.piPalette?.hideSlashSuggestions
        if (e.key === "ArrowDown") {
          e.preventDefault();
          state.slashSelection = Math.min(commands.length - 1, state.slashSelection + 1);
          render && render();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          state.slashSelection = Math.max(0, state.slashSelection - 1);
          render && render();
          return;
        }
        if ((e.key === "Tab" || e.key === "Enter") && commands[state.slashSelection]) {
          e.preventDefault();
          apply && apply(commands[state.slashSelection]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          hide && hide();
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        (window.sendMessage||window.piComposer?.sendMessage)?.(state.busy ? state.queueBehavior : undefined);
      } else if (e.key === "Enter" && e.altKey) {
        e.preventDefault();
        (window.sendMessage||window.piComposer?.sendMessage)?.("followUp");
      }
    });
    el.input.addEventListener("input", () => {
      (window.autosize||window.piComposer?.autosize)?.();
      state.slashSelection = 0;
      (window.renderSlashSuggestions||window.piPalette?.renderSlashSuggestions)?.();
    });
    el.input.addEventListener("paste", (...a)=> (window.pasteClipboardImages||window.piComposer?.pasteClipboardImages)?.(...a));
    el.input.addEventListener("click", ()=>(window.renderSlashSuggestions||window.piPalette?.renderSlashSuggestions)?.());
    el.input.addEventListener("blur", () => setTimeout(()=>(window.hideSlashSuggestions||window.piPalette?.hideSlashSuggestions)?.(), 120));
    el.attachBtn.addEventListener("click", () => (window.pickAttachments||window.piComposer?.pickAttachments)?.("files"));
    el.attachImageBtn.addEventListener("click", () => (window.pickAttachments||window.piComposer?.pickAttachments)?.("images"));
    for (const button of el.queueBehaviorButtons) {
      button.addEventListener("click", () => {
        state.queueBehavior = button.dataset.queueBehavior;
        for (const candidate of el.queueBehaviorButtons) candidate.classList.toggle("active", candidate === button);
        (window.setBusy||window.piComposer?.setBusy)?.(state.busy);
      });
    }

    el.newChat.addEventListener("click", () => (window.newChat||window.piSession?.newChat)?.());
    el.topNewChat.addEventListener("click", () => (window.newChat||window.piSession?.newChat)?.());
    el.commandsBtn.addEventListener("click", ()=> (window.openCommandPalette||window.piPalette?.openCommandPalette)?.());
    el.treeBtn.addEventListener("click", ()=> (window.openSessionTree||window.piSession?.openSessionTree)?.());
    el.sessionToolsBtn.addEventListener("click", ()=> (window.openSessionTools||window.piSession?.openSessionTools)?.());
    el.toggleSidebar.addEventListener("click", () => {
      setSidebarVisible(el.sidebar.classList.contains("collapsed"));
    });
    el.themeBtn.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
    el.addProject.addEventListener("click", async () => {
      try {
        const updated = await api.addProject();
        if (!updated) return;
        state.settings = updated;
        state.expandedProjects.add(updated.cwd);
        el.statusCwd.textContent = updated.cwd;
        await (window.newChat||window.piSession?.newChat)?.(updated.cwd);
      } catch (err) {
        toast(`Impossibile aggiungere il progetto: ${err.message}`, "error");
      }
    });
    el.sessionSearch.addEventListener("input", () => (window.renderProjects||window.piSidebar?.renderProjects)?.());

    el.commandsClose.addEventListener("click", () => el.modalCommands.close());
    el.commandSearch.addEventListener("input", () => {
      state.commandSelection = 0;
      (window.renderCommandPalette||window.piPalette?.renderCommandPalette)?.();
    });
    el.commandSearch.addEventListener("keydown", (event) => {
      const commands = (window.filteredCommands||window.piPalette?.filteredCommands||function(){return []})()
      if (event.key === "ArrowDown") {
        event.preventDefault();
        state.commandSelection = Math.min(commands.length - 1, state.commandSelection + 1);
        (window.renderCommandPalette||window.piPalette?.renderCommandPalette)?.();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        state.commandSelection = Math.max(0, state.commandSelection - 1);
        (window.renderCommandPalette||window.piPalette?.renderCommandPalette)?.();
      } else if (event.key === "Enter" && commands[state.commandSelection]) {
        event.preventDefault();
        (window.chooseCommand||window.piPalette?.chooseCommand)?.(commands[state.commandSelection]);
      }
    });
    el.treeClose.addEventListener("click", () => el.modalTree.close());
    el.treeRefresh.addEventListener("click", () => (window.loadSessionTree||window.piSession?.loadSessionTree)?.());
    el.childSession.addEventListener("click", () => (window.newChildSession||window.piSession?.newChildSession)?.());
    el.cloneSession.addEventListener("click", () => (window.cloneActiveSession||window.piSession?.cloneActiveSession)?.());
    el.sessionToolsClose.addEventListener("click", () => el.modalSessionTools.close());
    el.sessionRename.addEventListener("click", () => (window.renameSession||window.piSession?.renameSession)?.());
    el.sessionNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") (window.renameSession||window.piSession?.renameSession)?.();
    });
    el.steeringMode.addEventListener("change", async () => {
      try { await api.setSteeringMode(el.steeringMode.value); }
      catch (err) { toast(err.message, "error"); }
    });
    el.followUpMode.addEventListener("change", async () => {
      try { await api.setFollowUpMode(el.followUpMode.value); }
      catch (err) { toast(err.message, "error"); }
    });
    el.autoCompaction.addEventListener("change", async () => {
      try { await api.setAutoCompaction(el.autoCompaction.checked); }
      catch (err) { toast(err.message, "error"); }
    });
    el.autoRetry.addEventListener("change", async () => {
      try {
        await api.setAutoRetry(el.autoRetry.checked);
        state.autoRetryEnabled = el.autoRetry.checked;
      } catch (err) { toast(err.message, "error"); }
    });
    el.compactBtn.addEventListener("click", () => (window.compactSession||window.piSession?.compactSession)?.());
    el.copyLast.addEventListener("click", async () => {
      try {
        const data = await api.getLastAssistantText();
        if (!data.text) return toast("Non c’è ancora una risposta da copiare.", "warn");
        await navigator.clipboard.writeText(data.text);
        toast("Ultima risposta copiata.");
      } catch (err) { toast(`Copia fallita: ${err.message}`, "error"); }
    });
    el.exportHtml.addEventListener("click", async () => {
      try {
        const result = await api.exportHtml();
        if (!result.cancelled) toast(`Sessione esportata in ${result.path}`);
      } catch (err) { toast(`Export fallito: ${err.message}`, "error"); }
    });
    el.abortRetry.addEventListener("click", async () => {
      try { await api.abortRetry(); toast("Retry interrotto."); }
      catch (err) { toast(`Nessun retry da interrompere: ${err.message}`, "warn"); }
    });

    el.providerBtn.addEventListener("click", async () => {
      const isOpening = el.providerMenu.classList.contains("hidden");
      closeMenus();
      if (!isOpening) return;
      el.providerMenu.classList.remove("hidden");
      try {
        await (window.loadModels||window.piModels?.loadModels)?.(true);
        (window.renderProviderMenu||window.piModels?.renderProviderMenu)?.();
        (window.updateModelLabel||window.piModels?.updateModelLabel)?.();
      } catch (err) {
        el.providerList.innerHTML = `<div class="menu-empty">${escapeHtml(err.message)}</div>`;
      }
    });

    el.modelBtn.addEventListener("click", async () => {
      const isOpening = el.modelMenu.classList.contains("hidden");
      closeMenus();
      if (!isOpening) return;
      el.modelMenu.classList.remove("hidden");
      el.modelSearch.value = "";
      try {
        await (window.loadModels||window.piModels?.loadModels)?.(true);
        (window.renderModelMenu||window.piModels?.renderModelMenu)?.("");
      } catch (err) {
        el.modelList.innerHTML = `<div class="menu-empty">${escapeHtml(err.message)}</div>`;
      }
      el.modelSearch.focus();
    });
    el.modelSearch.addEventListener("input", () => (window.renderModelMenu||window.piModels?.renderModelMenu)?.(el.modelSearch.value));

    el.thinkingBtn.addEventListener("click", () => {
      const isOpening = el.thinkingMenu.classList.contains("hidden");
      closeMenus();
      if (!isOpening) return;
      el.thinkingMenu.classList.remove("hidden");
      (window.renderThinkingMenu||window.piModels?.renderThinkingMenu)?.();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".dropdown")) closeMenus();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".project-row") && !e.target.closest(".project-menu")) {
        if (state.openProjectMenu) {
          state.openProjectMenu = null;
          (window.renderProjects||window.piSidebar?.renderProjects)?.();
        }
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.openProjectMenu) {
        state.openProjectMenu = null;
        (window.renderProjects||window.piSidebar?.renderProjects)?.();
      }
    });

    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (a && /^https?:/i.test(a.getAttribute("href"))) {
        e.preventDefault();
        api.openExternal(a.href);
      }
    });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cb-copy");
      if (!btn) return;
      const pre = btn.closest(".codeblock")?.querySelector("pre");
      if (pre) {
        navigator.clipboard.writeText(pre.textContent);
        btn.textContent = "copiato!";
        setTimeout(() => (btn.textContent = "copia"), 1200);
      }
    });

    el.piChip.addEventListener("click", () => (window.openPiModal||window.piStatus?.openPiModal)?.());
    el.btnPiClose.addEventListener("click", () => el.modalPi.close());
    el.btnPiRecheck.addEventListener("click", () => (window.refreshPiStatus||window.piStatus?.refreshPiStatus)?.());
    el.btnPiInstall.addEventListener("click", () => (window.runMaintenance||window.piStatus?.runMaintenance)?.("install"));
    el.btnPiUpdate.addEventListener("click", () => (window.runMaintenance||window.piStatus?.runMaintenance)?.("update"));

    if (el.settingLanguage) {
      el.settingLanguage.value = (i18n && i18n.getLang()) || "it";
      el.settingLanguage.addEventListener("change", async () => {
        const lang = el.settingLanguage.value === "en" ? "en" : "it";
        if (i18n) i18n.setLang(lang);
        refreshIcons();
        (window.renderProjects||window.piSidebar?.renderProjects)?.();
        (window.renderProviderSettings||window.piAuth?.renderProviderSettings)?.();
        (window.renderPackageStore||window.piPackageView?.renderPackageStore)?.();
        (window.updateModelLabel||window.piModels?.updateModelLabel)?.();
        try { await api.setSettings({ language: lang }); state.settings.language = lang; } catch {}
        toast(lang === "en" ? "Language: English" : "Lingua: Italiano");
      });
    }
    if (i18n) i18n.applyI18n();
    el.btnSettingsOpen.addEventListener("click", () => {
      el.settingCwd.textContent = state.settings.cwd || "";
      el.settingPiPath.value = state.settings.piPath || "";
      el.settingSessionsDir.value = state.settings.sessionsDir || "";
      if (el.settingLanguage) el.settingLanguage.value = (i18n && i18n.getLang()) || state.settings.language || "it";
      (window.switchSettingsTab||window.piAuth?.switchSettingsTab)?.("general");
      el.modalSettings.showModal();
      if (i18n) i18n.applyI18n();
    });
    for (const tab of el.settingsTabs) {
      tab.addEventListener("click", () => (window.switchSettingsTab||window.piAuth?.switchSettingsTab)?.(tab.dataset.settingsTab));
    }
    el.providerSettingsSearch.addEventListener("input", () => (window.renderProviderSettings||window.piAuth?.renderProviderSettings)?.());
    el.piSettingsSave.addEventListener("click", () => (window.saveNativePiSettings||window.piAuth?.saveNativePiSettings)?.());
    el.authCancel.addEventListener("click", () => {
      if (!state.authFlow) return el.modalAuth.close();
      const respond = window.respondToAuthPrompt||window.piAuth?.respondToAuthPrompt;
      if (state.authFlow.requestId) respond && respond("", true);
      api.cancelProviderLogin(state.authFlow.providerId).catch(() => {});
      el.modalAuth.close();
    });
    el.authInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !el.authOk.classList.contains("hidden")) {
        event.preventDefault();
        (window.respondToAuthPrompt||window.piAuth?.respondToAuthPrompt)?.(el.authInput.value);
      }
    });

    el.packagesBtn.addEventListener("click", () => {
      el.packageLog.classList.add("hidden");
      el.packageLog.textContent = "";
      el.modalPackages.showModal();
      (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.({ resetPage: true });
      setTimeout(() => el.packageSearch.focus(), 50);
    });
    el.packagesClose.addEventListener("click", () => el.modalPackages.close());
    el.packagesDone.addEventListener("click", () => el.modalPackages.close());
    el.packagesRefresh.addEventListener("click", () => (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.());
    el.packageSourceInstall.addEventListener("click", () => (window.installManualSource||window.piPackageView?.installManualSource)?.());
    el.packageSource.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        (window.installManualSource||window.piPackageView?.installManualSource)?.();
      }
    });
    el.packagesUpdate.addEventListener("click", () => (window.updatePackageTarget||window.piPackageView?.updatePackageTarget)?.("extensions"));
    el.modelsUpdate.addEventListener("click", () => (window.updatePackageTarget||window.piPackageView?.updatePackageTarget)?.("models"));
    el.packagePrev.addEventListener("click", () => {
      if (state.packagePage > 1) {
        state.packagePage -= 1;
        (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.();
      }
    });
    el.packageNext.addEventListener("click", () => {
      const pages = Math.max(1, Math.ceil(state.packageTotal / state.packagePageSize));
      if (state.packagePage < pages) {
        state.packagePage += 1;
        (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.();
      }
    });
    let packageSearchTimer = null;
    el.packageSearch.addEventListener("input", () => {
      clearTimeout(packageSearchTimer);
      packageSearchTimer = setTimeout(() => (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.({ resetPage: true }), 350);
    });
    el.packageType.addEventListener("change", () => (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.({ resetPage: true }));
    el.packageSort.addEventListener("change", () => (window.loadPackageStore||window.piPackageView?.loadPackageStore)?.({ resetPage: true }));
    el.btnPickCwd.addEventListener("click", async () => {
      const dir = await api.pickDirectory(t("dialog.pickCwd"));
      if (dir) el.settingCwd.textContent = dir;
    });
    el.btnSettingsClose.addEventListener("click", () => el.modalSettings.close());
    el.btnSettingsSave.addEventListener("click", async () => {
      const previousCwd = state.settings.cwd;
      const lang = el.settingLanguage ? (el.settingLanguage.value === "en" ? "en" : "it") : (state.settings.language || "it");
      const patch = {
        cwd: el.settingCwd.textContent.trim(),
        piPath: el.settingPiPath.value.trim(),
        sessionsDir: el.settingSessionsDir.value.trim(),
        language: lang,
      };
      try {
        state.settings = await api.setSettings(patch);
        if (i18n && lang !== i18n.getLang()) i18n.setLang(lang);
        state.expandedProjects.add(state.settings.cwd);
        el.statusCwd.textContent = state.settings.cwd || "";
        el.modalSettings.close();
        toast(t("toast.saveSettings"));
        if (previousCwd !== state.settings.cwd) await (window.newChat||window.piSession?.newChat)?.(state.settings.cwd);
        else await (window.refreshSessions||window.piSidebar?.refreshSessions)?.();
      } catch (err) {
        toast(t("toast.saveSettingsFail", {msg: err.message}), "error");
      }
    });

    el.uiCancel.addEventListener("click", () => (window.answerUi||window.piExtensionBridge?.answerUi)?.({ cancelled: true }));

    document.addEventListener("keydown", (e) => {
      const command = e.ctrlKey || e.metaKey;
      if (command && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        (window.openCommandPalette||window.piPalette?.openCommandPalette)?.();
      } else if (command && e.key.toLowerCase() === "n") {
        e.preventDefault();
        (window.newChat||window.piSession?.newChat)?.();
      } else if (command && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarVisible(true);
        el.sessionSearch.focus();
        el.sessionSearch.select();
      } else if (command && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarVisible(el.sidebar.classList.contains("collapsed"));
      } else if (command && e.key.toLowerCase() === "l") {
        e.preventDefault();
        el.modelBtn.click();
      } else if (e.key === "Escape" && state.busy && !getUiRequest()) {
        (window.abortCurrentWork||window.piComposer?.abortCurrentWork)?.();
      }
    });
  }

  async function boot() {
    state.settings = await api.getSettings();
    const initialLang = state.settings.language === "en" || state.settings.language === "it" ? state.settings.language : (i18n ? i18n.getLang() : "it");
    if (i18n && initialLang !== i18n.getLang()) i18n.setLang(initialLang);
    else if (i18n) i18n.applyI18n();
    if (state.settings.sidebarVisible === false) el.sidebar.classList.add("collapsed");
    el.statusCwd.textContent = state.settings.cwd || "";
    state.expandedProjects.add(state.settings.cwd);
    setConversationMode(false, false);

    wireUi();
    // setupAppUpdates via piStatus
    (window.setupAppUpdates||window.piStatus?.setupAppUpdates)?.();
    const savedTheme = localStorage.getItem("pi-desktop-theme");
    const preferredTheme = savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(preferredTheme);
    refreshIcons();

    try {
      const started = await api.start({ persist: false });
      state.activeTabId = started.tabId || state.activeTabId;
      await (window.refreshTabs||window.piSidebar?.refreshTabs)?.();
      await (window.refreshHeaderFromState||window.piModels?.refreshHeaderFromState)?.();
      console.info("[pi-desktop] agente avviato");
    } catch (err) {
      if (err.code === "PI_NOT_INSTALLED" || /non installato/i.test(err.message)) {
        (window.showEmptyHint||window.piStatus?.showEmptyHint)?.(null);
      } else {
        toast(`Avvio agente: ${err.message}`, "error", 8000);
      }
    }

    await Promise.all([
      (window.refreshSessions||window.piSidebar?.refreshSessions)?.(),
      (window.refreshTabs||window.piSidebar?.refreshTabs)?.(),
      (window.refreshPiStatus||window.piStatus?.refreshPiStatus)?.(false)
    ]);
    el.emptyState.classList.remove("hidden");
    el.input.focus();

    setInterval(() => {
      (window.refreshSessions||window.piSidebar?.refreshSessions)?.();
      (window.refreshPiStatus||window.piStatus?.refreshPiStatus)?.();
    }, 30000);
  }

  window.piBootstrap = { wireUi, boot };
  window.wireUi = wireUi;
  window.boot = boot;
  if (typeof module !== "undefined" && module.exports) module.exports = { wireUi, boot };
})();
