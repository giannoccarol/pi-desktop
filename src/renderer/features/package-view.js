"use strict";
// package store UI extracted from app.js
(function(){ const api=window.piDesktop; const el=window.piStore.el; const state=window.piStore.state; function toast(m,k,ms){return window.piUi.toast(m,k,ms);} function escapeHtml(s){return window.piUtils.escapeHtml(s);} function icon(n){return window.piUi.icon(n);} function refreshIcons(){return window.piUi.refreshIcons();}
function installedPackageNames(){ return window.piPackageHelpers.installedPackageNames(state.installedPackages); }
function npmNameFromSource(s){ return window.piPackageHelpers.npmNameFromSource(s); }
function installedEntryForName(n){ return window.piPackageHelpers.installedEntryForName(state.installedPackages, n); }
function formatDownloads(v){ return window.piPackageHelpers.formatDownloads(v); }

async function loadPackageStore({ resetPage = false } = {}) {
  if (resetPage) state.packagePage = 1;
  el.packageList.innerHTML = `<div class="menu-empty">Caricamento catalogo…</div>`;
  try {
    const [catalog, installed, resources] = await Promise.all([
      api.searchPackages({
        query: el.packageSearch.value.trim(),
        type: el.packageType.value,
        sort: el.packageSort.value,
        page: state.packagePage,
      }),
      api.listInstalledPackages().catch(() => []),
      api.listPackageResources().catch(() => []),
    ]);
    const result = Array.isArray(catalog) ? { items: catalog, total: catalog.length, page: state.packagePage, pageSize: 50 } : catalog;
    state.packages = result?.items || [];
    state.packageTotal = Number(result?.total) || state.packages.length;
    state.packagePage = Number(result?.page) || state.packagePage;
    state.packagePageSize = Number(result?.pageSize) || 50;
    state.installedPackages = installed;
    state.packageResources = resources;
    renderPackageStore();
  } catch (err) {
    el.packageList.innerHTML = `<div class="menu-empty">Catalogo non disponibile.<br><span class="small">${escapeHtml(err.message)}</span></div>`;
  }
}

function renderPackageStore() {
  const installed = installedPackageNames();
  renderNativePackageSections();
  el.packageList.innerHTML = "";
  const pageCount = Math.max(1, Math.ceil(state.packageTotal / state.packagePageSize));
  el.packagePageInfo.textContent = `Pagina ${state.packagePage} di ${pageCount} · ${state.packageTotal.toLocaleString("it-IT")} pacchetti`;
  const catalogUrl = new URL("https://pi.dev/packages");
  if (el.packageSearch.value.trim()) catalogUrl.searchParams.set("name", el.packageSearch.value.trim());
  if (el.packageType.value) catalogUrl.searchParams.set("type", el.packageType.value);
  if (el.packageSort.value !== "downloads") catalogUrl.searchParams.set("sort", el.packageSort.value);
  if (state.packagePage > 1) catalogUrl.searchParams.set("page", String(state.packagePage));
  el.packageCatalogLink.href = catalogUrl.toString();
  el.packagePrev.disabled = state.packagePage <= 1 || Boolean(state.packageBusy);
  el.packageNext.disabled = state.packagePage >= pageCount || Boolean(state.packageBusy);
  if (!state.packages.length) {
    el.packageList.innerHTML = `<div class="menu-empty">Nessun pacchetto trovato.</div>`;
    return;
  }
  for (const pkg of state.packages) {
    const isInstalled = installed.has(pkg.name);
    const card = document.createElement("article");
    card.className = `package-card${isInstalled ? " installed" : ""}`;
    const tags = (pkg.types || []).map((type) => `<span class="package-type">${escapeHtml(type)}</span>`).join("") + (pkg.keywords || [])
      .filter((keyword) => keyword !== "pi-package" && keyword !== "pi")
      .slice(0, 3)
      .map((keyword) => `<span>${escapeHtml(keyword)}</span>`)
      .join("");
    card.innerHTML =
      `<div class="package-card-icon">${icon(isInstalled ? "badge-check" : "package")}</div>` +
      `<div class="package-card-content"><div class="package-card-title"><strong>${escapeHtml(pkg.name)}</strong>${pkg.version ? `<span>v${escapeHtml(pkg.version)}</span>` : ""}${isInstalled ? `<span class="package-installed-badge">Installato</span>` : ""}</div>` +
      `<p>${escapeHtml(pkg.description)}</p><div class="package-card-meta">${tags}` +
      `${pkg.publisher ? `<span>di ${escapeHtml(pkg.publisher)}</span>` : ""}<span class="package-card-downloads">${icon("download")} ${formatDownloads(pkg.monthlyDownloads || pkg.downloads)} / mese</span></div></div>` +
      `<div class="package-card-actions"><a class="icon-btn borderless tiny" href="${escapeHtml(pkg.npmUrl)}" title="Apri su npm" aria-label="Apri su npm">${icon("external-link")}</a>` +
      `<button class="btn ${isInstalled ? "ghost package-uninstall" : "primary package-install"}" ${state.packageBusy ? "disabled" : ""}>` +
      `${state.packageBusy === pkg.name ? "Attendi…" : isInstalled ? "Rimuovi" : "Installa"}</button></div>`;
    card.querySelector(".package-install")?.addEventListener("click", () => changePackage(pkg, "install"));
    card.querySelector(".package-uninstall")?.addEventListener("click", () => changePackage(pkg, "remove"));
    el.packageList.appendChild(card);
  }
  refreshIcons();
}

function renderNativePackageSections() {
  el.packageInstalledCount.textContent = String(state.installedPackages.length);
  el.packageInstalledList.innerHTML = "";
  if (!state.installedPackages.length) {
    el.packageInstalledList.innerHTML = `<div class="menu-empty">Nessun pacchetto configurato.</div>`;
  }
  for (const entry of state.installedPackages) {
    const row = document.createElement("div");
    row.className = "package-native-item";
    const copy = document.createElement("div");
    copy.className = "package-native-copy";
    const code = document.createElement("code");
    code.textContent = entry.source;
    code.title = entry.source;
    const badge = document.createElement("span");
    badge.className = "package-type";
    badge.textContent = entry.scope === "project" ? "progetto" : "utente";
    const update = document.createElement("button");
    update.className = "btn ghost small";
    update.textContent = "Aggiorna";
    update.disabled = Boolean(state.packageBusy);
    update.addEventListener("click", () => updatePackageTarget(entry.source));
    const remove = document.createElement("button");
    remove.className = "btn ghost small";
    remove.textContent = "Rimuovi";
    remove.disabled = Boolean(state.packageBusy);
    remove.addEventListener("click", () => removeInstalledSource(entry));
    const actions = document.createElement("div");
    actions.className = "package-native-actions";
    copy.append(code, badge);
    actions.append(update, remove);
    row.append(copy, actions);
    el.packageInstalledList.appendChild(row);
  }

  el.packageResourceCount.textContent = String(state.packageResources.length);
  el.packageResourceList.innerHTML = "";
  if (!state.packageResources.length) {
    el.packageResourceList.innerHTML = `<div class="menu-empty">Nessuna risorsa rilevata.</div>`;
  }
  for (const resource of state.packageResources) {
    const row = document.createElement("label");
    row.className = "package-resource-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = resource.enabled;
    checkbox.disabled = Boolean(state.packageBusy);
    const copy = document.createElement("span");
    copy.className = "grow";
    const title = document.createElement("strong");
    title.textContent = resource.name;
    const meta = document.createElement("small");
    meta.className = "muted";
    meta.textContent = `${resource.type} · ${resource.metadata?.source || "auto"} · ${resource.metadata?.scope || "user"}`;
    meta.title = resource.path;
    copy.append(title, meta);
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      try {
        await api.setPackageResourceEnabled(resource, checkbox.checked);
        state.packageResources = await api.listPackageResources();
        state.commands = [];
        toast(`${resource.name} ${checkbox.checked ? "abilitata" : "disabilitata"}.`);
        renderNativePackageSections();
      } catch (err) {
        checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
        toast(`Configurazione risorsa fallita: ${err.message}`, "error", 8000);
      }
    });
    row.append(checkbox, copy);
    el.packageResourceList.appendChild(row);
  }
}

async function changePackage(pkg, action) {
  const verb = action === "install" ? "installare" : "rimuovere";
  if (action === "install" && !confirm(`Vuoi ${verb} ${pkg.name}? I plugin di pi possono eseguire codice con i tuoi permessi.`)) return;
  const installedEntry = installedEntryForName(pkg.name);
  const scope = action === "remove" ? (installedEntry?.scope || "user") : el.packageScope.value;
  if (action === "remove" && !confirm(`Vuoi rimuovere ${pkg.name} dalla configurazione ${scope === "project" ? "del progetto" : "utente"} di pi?`)) return;
  state.packageBusy = pkg.name;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent = `— ${action === "install" ? "Installazione" : "Rimozione"} di ${pkg.name} —\n`;
  renderPackageStore();
  try {
    state.installedPackages = action === "install"
      ? await api.installPackage(pkg.name, scope)
      : await api.removePackage(pkg.name, scope);
    state.packageResources = await api.listPackageResources().catch(() => []);
    state.modelsCache = null;
    toast(`${pkg.name} ${action === "install" ? "installato" : "rimosso"}. Runtime di pi ricaricato.`);
  } catch (err) {
    el.packageLog.textContent += `✗ ${err.message}\n`;
    toast(`${pkg.name}: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

async function installManualSource() {
  const source = el.packageSource.value.trim();
  if (!source) return;
  if (!confirm(`Installare ${source} nello scope ${el.packageScope.value === "project" ? "progetto" : "utente"}? Può eseguire codice con i tuoi permessi.`)) return;
  state.packageBusy = source;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent = `— Installazione di ${source} —\n`;
  renderPackageStore();
  try {
    state.installedPackages = await api.installPackageSource(source, el.packageScope.value);
    state.packageResources = await api.listPackageResources().catch(() => []);
    el.packageSource.value = "";
    state.commands = [];
    toast("Sorgente installata; runtime Pi ricaricato.");
  } catch (err) {
    el.packageLog.textContent += `✗ ${err.message}\n`;
    toast(`Installazione fallita: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

async function removeInstalledSource(entry) {
  if (!confirm(`Rimuovere ${entry.source} dallo scope ${entry.scope === "project" ? "progetto" : "utente"}?`)) return;
  state.packageBusy = entry.source;
  try {
    state.installedPackages = await api.removePackageSource(entry.source, entry.scope);
    state.packageResources = await api.listPackageResources().catch(() => []);
    state.commands = [];
    toast("Pacchetto rimosso; runtime Pi ricaricato.");
  } catch (err) {
    toast(`Rimozione fallita: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

async function updatePackageTarget(target) {
  state.packageBusy = target;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent = `— Aggiornamento ${target} —\n`;
  renderPackageStore();
  try {
    state.installedPackages = await api.updatePackages(target);
    state.packageResources = await api.listPackageResources().catch(() => []);
    state.modelsCache = null;
    state.commands = [];
    toast(target === "models" ? "Cataloghi modelli aggiornati." : "Aggiornamento completato; runtime Pi ricaricato.");
  } catch (err) {
    el.packageLog.textContent += `✗ ${err.message}\n`;
    toast(`Aggiornamento fallito: ${err.message}`, "error", 8000);
  } finally {
    state.packageBusy = null;
    renderPackageStore();
  }
}

function appendPackageOutput(line) {
  if (!el.modalPackages.open) return;
  el.packageLog.classList.remove("hidden");
  el.packageLog.textContent += `${line}\n`;
  el.packageLog.scrollTop = el.packageLog.scrollHeight;
}
window.piPackageView={installedPackageNames,npmNameFromSource,installedEntryForName,formatDownloads,loadPackageStore,renderPackageStore,renderNativePackageSections,changePackage,installManualSource,removeInstalledSource,updatePackageTarget,appendPackageOutput};
window.installedPackageNames=installedPackageNames; window.npmNameFromSource=npmNameFromSource; window.installedEntryForName=installedEntryForName; window.formatDownloads=formatDownloads; window.loadPackageStore=loadPackageStore; window.renderPackageStore=renderPackageStore; window.renderNativePackageSections=renderNativePackageSections; window.changePackage=changePackage; window.installManualSource=installManualSource; window.removeInstalledSource=removeInstalledSource; window.updatePackageTarget=updatePackageTarget; window.appendPackageOutput=appendPackageOutput;
})();
