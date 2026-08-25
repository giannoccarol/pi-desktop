"use strict";

/**
 * Navigation helpers – tabs + projects/sessions sidebar.
 * Pure where possible: callers pass state slices, not globals.
 * Exposed as window.piNavigation for delegation from app.js.
 * Behaviour locked by test/navigation.test.mjs
 */

(function exposeNavigation(root) {
  const utils = root.piUtils || null;
  // t is looked up dynamically so tests can inject
  const getT = () => (root.i18n ? root.i18n.t : (k) => k);

  function truncate(s, n) {
    if (utils?.truncate) return utils.truncate(s, n);
    return s && s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function basename(p) {
    if (utils?.basename) return utils.basename(p);
    if (!p) return "";
    return String(p).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  }

  function configuredProjects(settings) {
    const values = Array.isArray(settings?.projects) ? settings.projects : [settings?.cwd];
    return [...new Set(values.filter(Boolean))];
  }

  function sessionsForProject({ sessions, tabs }, projectPath) {
    const t = getT();
    const saved = sessions.filter((session) => session.cwd === projectPath);
    const drafts = tabs
      .filter((tab) => tab.cwd === projectPath && !tab.sessionFile)
      .map((tab) => ({
        file: `tab:${tab.id}`,
        tabId: tab.id,
        draft: true,
        cwd: tab.cwd,
        name: tab.title || t("session.newChat"),
        hasName: true,
        preview: tab.title || "",
        modified: tab.createdAt,
        busy: tab.busy,
        preference: null,
      }));
    drafts.sort((a, b) => {
      const diff = (b.modified || 0) - (a.modified || 0);
      if (diff !== 0) return diff;
      return String(a.file).localeCompare(String(b.file));
    });
    const savedSorted = [...saved].sort((a, b) => {
      const diff = (b.modified || 0) - (a.modified || 0);
      if (diff !== 0) return diff;
      return String(a.file).localeCompare(String(b.file));
    });
    return [...drafts, ...savedSorted];
  }

  function tabDisplayTitle(tab, sessions) {
    const t = getT();
    const session = tab.sessionFile && sessions.find((candidate) => candidate.file === tab.sessionFile);
    if (session) return session.hasName ? session.name : truncate(session.preview || t("session.newChat"), 96);
    return truncate(tab.title || t("session.newChat"), 96);
  }

  function tabSubtitle(tab, sessions) {
    const session = tab.sessionFile ? sessions.find((candidate) => candidate.file === tab.sessionFile) : null;
    const project = tab.cwd ? basename(tab.cwd) : "";
    if (session && session.hasName && session.preview) {
      const prev = truncate(session.preview.replace(/\s+/g, " ").trim(), 42);
      return project ? `${project} · ${prev}` : prev;
    }
    if (!session && tab.title && project && tab.title !== project) return project;
    return project;
  }

  function tabTooltip(tab, title, sessions) {
    const parts = [title];
    if (tab.cwd) parts.push(tab.cwd);
    const session = tab.sessionFile ? sessions.find((candidate) => candidate.file === tab.sessionFile) : null;
    if (session && session.preview && session.preview !== title) parts.push(truncate(session.preview, 120));
    if (tab.busy) parts.push("in esecuzione");
    return parts.join("\n");
  }

  // Search helpers (pure filtering, no DOM)
  function filterProjectsForSearch(projectsWithSessions, query) {
    const q = String(query || "").toLowerCase().trim();
    if (!q) return projectsWithSessions;
    return projectsWithSessions.filter((project) => {
      const matchesProject = `${basename(project.path)} ${project.path}`.toLowerCase().includes(q);
      const matchingSessions = (project.sessions || []).filter((session) =>
        `${session.name || ""} ${session.preview || ""}`.toLowerCase().includes(q)
      );
      return matchesProject || matchingSessions.length;
    });
  }

  const api = {
    configuredProjects,
    sessionsForProject,
    tabDisplayTitle,
    tabSubtitle,
    tabTooltip,
    filterProjectsForSearch,
  };
  root.piNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
