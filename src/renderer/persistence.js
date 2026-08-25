"use strict";

/**
 * Persistence helpers – localStorage backed state (expanded projects, command usage).
 * Pure-ish: state is passed in, storage is injectable for tests.
 * Exposed as window.piPersistence, fallback wrappers in app.js keep behaviour identical.
 */

(function exposePersistence(root) {
  const EXPANDED_PROJECTS_KEY = "pi-desktop-expanded-projects";
  const COMMAND_USAGE_KEY = "pi-desktop-command-usage";

  function persistExpandedProjects(expandedSet, storage = root.localStorage) {
    try {
      storage.setItem(EXPANDED_PROJECTS_KEY, JSON.stringify([...expandedSet]));
    } catch {}
  }

  function restoreExpandedProjects(expandedSet, storage = root.localStorage) {
    try {
      const raw = storage.getItem(EXPANDED_PROJECTS_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      for (const p of arr) if (typeof p === "string" && p.trim()) expandedSet.add(p);
    } catch {}
  }

  function setProjectExpanded(expandedSet, projectPath, expanded, storage = root.localStorage) {
    if (expanded) expandedSet.add(projectPath);
    else expandedSet.delete(projectPath);
    persistExpandedProjects(expandedSet, storage);
  }

  function toggleProjectExpanded(expandedSet, projectPath, storage = root.localStorage) {
    if (expandedSet.has(projectPath)) expandedSet.delete(projectPath);
    else expandedSet.add(projectPath);
    persistExpandedProjects(expandedSet, storage);
  }

  function commandUsageScore(commandUsage, name, nowMs = Date.now()) {
    const usage = commandUsage[name];
    if (!usage) return 0;
    const ageDays = Math.max(0, (nowMs - (usage.lastUsed || 0)) / 86400000);
    return (usage.count || 0) * 100 + Math.max(0, 30 - ageDays);
  }

  function recordCommandUsage(commandUsage, name, storage = root.localStorage, nowMs = Date.now()) {
    if (!name) return commandUsage;
    const previous = commandUsage[name] || { count: 0, lastUsed: 0 };
    commandUsage[name] = { count: previous.count + 1, lastUsed: nowMs };
    try {
      storage.setItem(COMMAND_USAGE_KEY, JSON.stringify(commandUsage));
    } catch {}
    return commandUsage;
  }

  function loadCommandUsage(storage = root.localStorage) {
    try {
      return JSON.parse(storage.getItem(COMMAND_USAGE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  const api = {
    EXPANDED_PROJECTS_KEY,
    COMMAND_USAGE_KEY,
    persistExpandedProjects,
    restoreExpandedProjects,
    setProjectExpanded,
    toggleProjectExpanded,
    commandUsageScore,
    recordCommandUsage,
    loadCommandUsage,
  };
  root.piPersistence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
