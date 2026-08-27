"use strict";
// Extracted from app.js: pi status + app OTA updates
(function(){
const api=window.piDesktop; const el=window.piStore.el; const state=window.piStore.state; function t(k,v){ return window.i18n ? window.i18n.t(k,v) : String(k); } function toast(m,k,ms){return window.piUi.toast(m,k,ms);} function refreshIcons(){return window.piUi.refreshIcons();} function escapeHtml(s){return window.piUtils.escapeHtml(s);}
async function refreshPiStatus(openModalOnError = false) {
  try {
    const st = await api.updateStatus();
    el.piChip.className = "pi-status-button";
    if (!st.installed) {
      el.piChip.classList.add("missing");
      el.piChipText.textContent = "pi non installato";
      showEmptyHint(st);
      if (openModalOnError) openPiModal(st);
    } else if (st.updateAvailable) {
      el.piChip.classList.add("update");
      el.piChipText.textContent = `pi ${st.version} → ${st.latest} disponibile`;
      el.emptyHint.classList.add("hidden");
    } else {
      el.piChip.classList.add(t("tool.ok"));
      el.piChipText.textContent = `pi ${st.version}`;
      el.emptyHint.classList.add("hidden");
    }
    renderPiStatusBox(st);
    return st;
  } catch (err) {
    el.piChipText.textContent = "pi: ?";
    el.piChip.className = "pi-status-button missing";
    return null;
  }
}

function showEmptyHint(st) {
  el.emptyHint.classList.remove("hidden");
  el.emptyHint.innerHTML =
    `<strong>pi non risulta installato sul sistema.</strong><br/>` +
    `<p class="muted small">Pi Desktop usa il comando <code>pi</code> installato globalmente (mai una copia interna), ` +
    `così puoi aggiornare l'agente indipendentemente dall'app.</p>` +
    `<p class="mono small">npm install -g --ignore-scripts @earendil-works/pi-coding-agent<br/>` +
    `<span class="muted">oppure</span><br/>curl -fsSL https://pi.dev/install.sh | sh</p>` +
    `<button id="hint-install" class="btn primary">Installa ora con npm</button>`;
  el.emptyHint.querySelector("#hint-install").addEventListener("click", () => runMaintenance("install"));
}

function renderPiStatusBox(st) {
  if (!st) {
    el.piStatusBox.innerHTML = `<span class="muted">Stato non disponibile.</span>`;
    return;
  }
  if (!st.installed) {
    el.piStatusBox.innerHTML =
      `<strong style="color:var(--red)">Non installato</strong><br/>` +
      `<span class="muted small">L'app lo cercherà nel PATH (anche ~/.local/bin, /usr/local/bin).</span>`;
    el.btnPiInstall.classList.remove("hidden");
    el.btnPiUpdate.classList.add("hidden");
    return;
  }
  let html = `<strong>pi ${escapeHtml(st.version || "?")}</strong><br/>` +
    `<span class="muted small mono ellipsis" title="${escapeHtml(st.bin)}">${escapeHtml(st.bin)}</span>`;
  if (st.updateAvailable) {
    html += `<br/><span style="color:var(--amber)">Aggiornamento disponibile: ${escapeHtml(st.latest)}. L'aggiornamento usa l'updater di pi stesso (<code>pi update --self</code>): nessuna dipendenza dall'app.</span>`;
    el.btnPiUpdate.classList.remove("hidden");
    el.btnPiUpdate.classList.add("primary");
  } else {
    html += `<br/><span style="color:var(--green)">Aggiornato ✓ ultima versione su npm (${escapeHtml(st.latest || "n/d")}).</span>`;
    el.btnPiUpdate.classList.remove("primary");
    el.btnPiUpdate.classList.toggle("hidden", !st.latest);
  }
  el.btnPiInstall.classList.add("hidden");
  el.piStatusBox.innerHTML = html;
}

function openPiModal(st) {
  if (st) renderPiStatusBox(st);
  else refreshPiStatus().then((s) => renderPiStatusBox(s));
  el.modalPi.showModal();
}

async function runMaintenance(kind) {
  el.maintenanceLog.classList.remove("hidden");
  el.maintenanceLog.textContent = "";
  el.btnPiInstall.disabled = true;
  el.btnPiUpdate.disabled = true;
  const appendLine = (line) => {
    el.maintenanceLog.textContent += line + "\n";
    el.maintenanceLog.scrollTop = el.maintenanceLog.scrollHeight;
  };
  state.maintenanceAppend = appendLine;
  appendLine(`— ${kind === "install" ? "installazione" : "aggiornamento"} di pi (indipendente dall'app) —`);
  try {
    const res = await api.maintenance(kind);
    appendLine(res.ok ? "✓ riuscito" : "✗ fallito");
    if (res.status) renderPiStatusBox(res.status);
    await refreshPiStatus();
    if (res.ok) toast(kind === "install" ? "pi installato." : "pi aggiornato.");
  } finally {
    el.btnPiInstall.disabled = false;
    el.btnPiUpdate.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// App OTA (electron-updater, GitHub Releases — come gittree)
// ---------------------------------------------------------------------------
let appUpdateState = null;

function headerUpdateLabel(state, phase) {
  const version = state.availableVersion || "";
  if (phase === "download") return t("updates.app.headerDownload", { version });
  if (phase === "install") {
    if (state.cachedInstall) return t("updates.app.headerInstall", { version });
    if (state.autoInstall === false) return t("updates.app.manualInstall");
    return t("updates.app.restart");
  }
  if (state.status === "downloading") return t("updates.app.downloading", { progress: state.progress || 0 });
  if (state.status === "available" || updateVersionIsNewer(state)) {
    return state.autoInstall === false
      ? t("updates.app.headerDownload", { version })
      : t("updates.app.availableVersion", { version });
  }
  if (state.status === "downloaded") {
    if (state.cachedInstall) return t("updates.app.headerInstall", { version });
    if (state.autoInstall === false) return t("updates.app.manualInstall");
    return t("updates.app.restart");
  }
  return t("updates.app.checkTitle");
}

async function performAppUpdateAction() {
  const phase = updateActionPhase(appUpdateState);
  if (phase === "install") {
    toast(t("updates.app.pacmanInstalling"), "info", 8000);
    const res = await api.installAppUpdate();
    if (res?.state) handleAppUpdateState(res.state);
    else if (res.restartRequired || res.installed) toast(t("updates.app.pacmanDone"), "success", 8000);
    else if (res.manual || res.opened) toast(t("updates.app.manualOpened"), "info");
    else if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
    return res;
  }
  if (phase === "download") {
    const res = await api.downloadAppUpdate();
    if (res?.state) handleAppUpdateState(res.state);
    else if (res.manual || res.opened) toast(t("updates.app.manualOpened"), "info", 9000);
    else if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
    return res;
  }
  if (phase === "downloading" || phase === "checking") return null;
  const res = await api.checkAppUpdate();
  if (res?.state) handleAppUpdateState(res.state);
  else if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
  return res;
}

async function setupAppUpdates() {
  const btn = el.btnAppUpdate;
  const settingsBtn = el.btnCheckAppUpdate;
  const settingsStatus = el.checkAppUpdateStatus;
  if (btn) {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await performAppUpdateAction();
      } finally {
        if (appUpdateState?.status !== "downloading" && appUpdateState?.status !== "checking") {
          btn.disabled = false;
        }
      }
    });
  }
  if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
      if (settingsBtn.dataset.staleRestart === "1") {
        await api.relaunchApp();
        return;
      }
      settingsBtn.disabled = true;
      if (settingsStatus) settingsStatus.textContent = t("settings.checking");
      const res = await api.checkAppUpdate();
      if (res?.state) handleAppUpdateState(res.state);
      else if (!res.success && res.error) toast(t("updates.app.failed", { error: res.error }), "error");
      settingsBtn.disabled = false;
    });
  }
  api.on("update:state", handleAppUpdateState);
  try {
    const initial = await api.getAppUpdateState();
    handleAppUpdateState(initial);
  } catch {}
}

function updateVersionIsNewer(state) {
  const current = String(state?.currentVersion || "");
  const available = String(state?.availableVersion || "");
  if (!current || !available) return false;
  const normalize = (value) => String(value).split(/[.-]/).map((part) => parseInt(part, 10) || 0);
  const left = normalize(available);
  const right = normalize(current);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta > 0) return true;
    if (delta < 0) return false;
  }
  return false;
}

function updateActionPhase(state) {
  if (!state) return "check";
  if (state.status === "downloading") return "downloading";
  if (state.status === "checking") return "checking";
  if (state.status === "downloaded" && state.cachedInstall && state.pendingPackagePath) return "install";
  if (state.status === "available" || updateVersionIsNewer(state)) return "download";
  if (state.status === "downloaded") return "install";
  return "check";
}

function manualUpdateHint(state) {
  if (state.cachedInstall && state.pendingPackagePath) {
    return t("updates.app.cachedReady", { version: state.availableVersion || "?" });
  }
  return t("updates.app.manualReady", { version: state.availableVersion || "?" });
}

function handleAppUpdateState(state) {
  if (!state) return;
  const prev = appUpdateState?.status;
  appUpdateState = state;
  const manual = state.autoInstall === false;
  const cached = Boolean(state.cachedInstall);
  const phase = updateActionPhase(state);
  const btn = el.btnAppUpdate;
  if (btn) {
    const icon = btn.querySelector("i");
    const label = btn.querySelector("span");
    const visible = ["available", "downloading", "downloaded"].includes(String(state.status))
      || updateVersionIsNewer(state);
    btn.classList.toggle("hidden", !visible);
    btn.disabled = state.status === "downloading" || state.status === "checking";
    const headerLabel = headerUpdateLabel(state, phase);
    if (state.status === "available" || (updateVersionIsNewer(state) && state.status !== "downloading")) {
      if (icon) icon.setAttribute("data-lucide", "download");
      if (label) label.textContent = headerLabel;
      btn.title = manual ? manualUpdateHint(state) : headerLabel;
      btn.classList.remove("is-downloading");
      if (prev !== "available") {
        toast(manual ? manualUpdateHint(state) : t("updates.app.availableVersion", { version: state.availableVersion || "" }), "info", manual ? 9000 : 5200);
      }
    } else if (state.status === "downloading") {
      if (icon) icon.setAttribute("data-lucide", "loader-circle");
      if (label) label.textContent = headerLabel;
      btn.title = headerLabel;
      btn.classList.add("is-downloading");
    } else if (state.status === "downloaded") {
      if (cached) {
        if (icon) icon.setAttribute("data-lucide", "package");
      } else if (manual) {
        if (icon) icon.setAttribute("data-lucide", "external-link");
      } else {
        if (icon) icon.setAttribute("data-lucide", "refresh-cw");
      }
      if (label) label.textContent = headerLabel;
      btn.title = cached ? manualUpdateHint(state) : manual ? manualUpdateHint(state) : t("updates.app.ready");
      btn.classList.remove("is-downloading");
      if (prev !== "downloaded") {
        toast(
          cached ? t("updates.app.cachedReady", { version: state.availableVersion || "?" })
            : manual ? manualUpdateHint(state) : t("updates.app.ready"),
          cached || manual ? "info" : "success",
          cached || manual ? 9000 : 5200
        );
      }
    } else if (state.status === "error" && state.error) {
      toast(t("updates.app.failed", { error: state.error }), "error");
    }
  } else if (state.status === "error" && state.error) {
    toast(t("updates.app.failed", { error: state.error }), "error");
  }
  if (el.appVersion) {
    el.appVersion.textContent = state.currentVersion ? `v${state.currentVersion}` : (appUpdateState?.currentVersion ? `v${appUpdateState.currentVersion}` : "—");
  }
  if (el.checkAppUpdateStatus) {
    if (state.status === "checking") el.checkAppUpdateStatus.textContent = t("settings.checking");
    else if (state.status === "idle" && !updateVersionIsNewer(state)) el.checkAppUpdateStatus.textContent = t("settings.upToDate");
    else if (state.status === "error" && state.error) el.checkAppUpdateStatus.textContent = state.error;
    else if (["available", "downloading", "downloaded"].includes(String(state.status)) || updateVersionIsNewer(state)) {
      el.checkAppUpdateStatus.textContent = t("settings.appUpdate.useHeader");
    } else el.checkAppUpdateStatus.textContent = "";
  }
  if (el.btnCheckAppUpdate) {
    el.btnCheckAppUpdate.textContent = t("settings.checkUpdate");
    el.btnCheckAppUpdate.disabled = state.status === "checking";
  }
  refreshIcons();
}

async function refreshGitStatus(){
  try{
    const api = window.piDesktop;
    if(!api || typeof api.getGitStatus!=="function") return;
    const cwd = (window.piStore && window.piStore.state && window.piStore.state.settings && window.piStore.state.settings.cwd) || null;
    const st = await api.getGitStatus(cwd);
    const elGit = (window.piStore && window.piStore.el && window.piStore.el.gitStatus) || document.getElementById("git-status");
    if(!elGit) return;
    if(!st || !st.isGit || !st.branch){
      elGit.classList.add("hidden");
      elGit.textContent="";
      return;
    }
    elGit.textContent = st.label || st.branch;
    elGit.title = st.label || st.branch;
    elGit.classList.remove("hidden");
  } catch {}
}
window.refreshPiStatus=refreshPiStatus; window.showEmptyHint=showEmptyHint; window.renderPiStatusBox=renderPiStatusBox; window.openPiModal=openPiModal; window.runMaintenance=runMaintenance; window.setupAppUpdates=setupAppUpdates; window.handleAppUpdateState=handleAppUpdateState; window.refreshGitStatus=refreshGitStatus; window.piStatus={refreshPiStatus,showEmptyHint,renderPiStatusBox,openPiModal,runMaintenance,setupAppUpdates,handleAppUpdateState,refreshGitStatus};
})();
