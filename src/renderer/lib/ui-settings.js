"use strict";

/**
 * UI preferences backed by settings.json (with one-time localStorage migration).
 */
(function exposeUiSettings(root) {
  const THEME_KEY = "pi-desktop-theme";
  const NOTIF_KEY = "pi-desktop-notifications-enabled";
  const SOUND_KEY = "pi-desktop-notifications-sound";
  const SIDEBAR_KEY = "pi-desktop-sidebar-width";
  const DIFF_KEY = "pi-diff-mode";
  const EXPANDED_KEY = "pi-desktop-expanded-projects";

  function readLocal(storage, key, fallback = null) {
    try {
      const v = storage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function writeLocal(storage, key, value) {
    try { storage.setItem(key, value); } catch {}
  }

  function resolvedTheme(settings, storage = root.localStorage) {
    const fromSettings = settings?.theme;
    if (fromSettings === "dark" || fromSettings === "light") return fromSettings;
    const saved = readLocal(storage, THEME_KEY, "");
    if (saved === "dark" || saved === "light") return saved;
    if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }

  function notificationsEnabled(settings, storage = root.localStorage) {
    if (settings && settings.notificationsEnabled !== undefined) return Boolean(settings.notificationsEnabled);
    const v = readLocal(storage, NOTIF_KEY, null);
    if (v === null) return true;
    return v !== "false" && v !== "0";
  }

  function notificationsSound(settings, storage = root.localStorage) {
    if (settings && settings.notificationsSound !== undefined) return Boolean(settings.notificationsSound);
    return readLocal(storage, SOUND_KEY, "false") === "true";
  }

  function sidebarWidth(settings, storage = root.localStorage) {
    const fromSettings = Number(settings?.sidebarWidth);
    if (Number.isFinite(fromSettings) && fromSettings >= 210 && fromSettings <= 520) return fromSettings;
    const saved = parseInt(readLocal(storage, SIDEBAR_KEY, ""), 10);
    return Number.isFinite(saved) && saved >= 210 && saved <= 520 ? saved : null;
  }

  function diffMode(settings, storage = root.localStorage) {
    if (settings?.diffMode === "split") return "split";
    const saved = readLocal(storage, DIFF_KEY, "unified");
    return saved === "split" ? "split" : "unified";
  }

  function expandedProjectsList(settings, storage = root.localStorage) {
    if (Array.isArray(settings?.expandedProjects) && settings.expandedProjects.length) {
      return settings.expandedProjects.filter((p) => typeof p === "string" && p.trim());
    }
    try {
      const raw = storage.getItem(EXPANDED_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((p) => typeof p === "string" && p.trim()) : [];
    } catch {
      return [];
    }
  }

  async function migrateLocalStorageToSettings(api, settings, storage = root.localStorage) {
    if (!api?.setSettings || !settings) return settings;
    const patch = {};
    if (!settings.theme) {
      const saved = readLocal(storage, THEME_KEY, "");
      if (saved === "dark" || saved === "light") patch.theme = saved;
    }
    if (settings.notificationsEnabled === undefined && storage.getItem(NOTIF_KEY) !== null) {
      patch.notificationsEnabled = notificationsEnabled(settings, storage);
    }
    if (settings.notificationsSound === undefined && storage.getItem(SOUND_KEY) !== null) {
      patch.notificationsSound = notificationsSound(settings, storage);
    }
    if (settings.sidebarWidth == null) {
      const w = sidebarWidth(settings, storage);
      if (w != null) patch.sidebarWidth = w;
    }
    if (!settings.diffMode && storage.getItem(DIFF_KEY)) {
      patch.diffMode = diffMode(settings, storage);
    }
    if (!Array.isArray(settings.expandedProjects) || !settings.expandedProjects.length) {
      const expanded = expandedProjectsList(settings, storage);
      if (expanded.length) patch.expandedProjects = expanded;
    }
    if (!Object.keys(patch).length) return settings;
    const updated = await api.setSettings(patch);
    return updated?.cwd ? updated : { ...settings, ...patch };
  }

  async function persistTheme(api, theme) {
    const resolved = theme === "dark" ? "dark" : "light";
    writeLocal(root.localStorage, THEME_KEY, resolved);
    if (api?.setSettings) {
      const res = await api.setSettings({ theme: resolved });
      if (res?.saveOk === false) throw new Error("Salvataggio tema fallito");
    }
    return resolved;
  }

  async function persistNotifications(api, { enabled, sound }) {
    const patch = {};
    if (enabled !== undefined) {
      patch.notificationsEnabled = Boolean(enabled);
      writeLocal(root.localStorage, NOTIF_KEY, String(patch.notificationsEnabled));
    }
    if (sound !== undefined) {
      patch.notificationsSound = Boolean(sound);
      writeLocal(root.localStorage, SOUND_KEY, String(patch.notificationsSound));
    }
    if (api?.setSettings && Object.keys(patch).length) {
      const res = await api.setSettings(patch);
      if (res?.saveOk === false) throw new Error("Salvataggio notifiche fallito");
      return res;
    }
    return patch;
  }

  async function persistSidebarWidth(api, width) {
    const n = Math.max(210, Math.min(520, Math.round(Number(width) || 0)));
    writeLocal(root.localStorage, SIDEBAR_KEY, String(n));
    if (api?.setSettings) {
      const res = await api.setSettings({ sidebarWidth: n });
      if (res?.saveOk === false) throw new Error("Salvataggio larghezza sidebar fallito");
    }
    return n;
  }

  async function persistDiffMode(api, mode) {
    const resolved = mode === "split" ? "split" : "unified";
    writeLocal(root.localStorage, DIFF_KEY, resolved);
    if (api?.setSettings) {
      const res = await api.setSettings({ diffMode: resolved });
      if (res?.saveOk === false) throw new Error("Salvataggio modalità diff fallito");
    }
    return resolved;
  }

  async function persistExpandedProjects(api, expandedSet) {
    const list = [...expandedSet].filter((p) => typeof p === "string" && p.trim());
    writeLocal(root.localStorage, EXPANDED_KEY, JSON.stringify(list));
    if (api?.setSettings) {
      const res = await api.setSettings({ expandedProjects: list });
      if (res?.saveOk === false) throw new Error("Salvataggio progetti espansi fallito");
    }
    return list;
  }

  async function persistComposerAutoRetry(api, enabled) {
    if (api?.setSettings) {
      const res = await api.setSettings({ composerAutoRetry: Boolean(enabled) });
      if (res?.saveOk === false) throw new Error("Salvataggio auto-retry fallito");
      return res;
    }
    return { composerAutoRetry: Boolean(enabled) };
  }

  const api = {
    resolvedTheme,
    notificationsEnabled,
    notificationsSound,
    sidebarWidth,
    diffMode,
    expandedProjectsList,
    migrateLocalStorageToSettings,
    persistTheme,
    persistNotifications,
    persistSidebarWidth,
    persistDiffMode,
    persistExpandedProjects,
    persistComposerAutoRetry,
  };
  root.piUiSettings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
