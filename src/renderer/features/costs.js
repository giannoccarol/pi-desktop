"use strict";
// Costs aggregation per project — pure functions + minimal UI wiring.
(function exposeCosts(root){
  function aggregateCostsByProject(sessions, statsByProject) {
    const map = new Map();
    const sessionsByCwd = new Map();
    for (const s of (sessions || [])) {
      if (!s || !s.cwd) continue;
      const key = s.cwd;
      const cur = sessionsByCwd.get(key) || { count: 0, cost: 0, tokens: 0 };
      cur.count += 1;
      // sessions may have usage/cost encoded in preview? fallback to 0
      if (typeof s.cost === "number") cur.cost += s.cost;
      if (s.tokens && typeof s.tokens.total === "number") cur.tokens += s.tokens.total;
      else if (typeof s.tokens === "number") cur.tokens += s.tokens;
      sessionsByCwd.set(key, cur);
    }
    // merge live stats if provided
    if (statsByProject && typeof statsByProject === "object") {
      for (const [cwd, st] of Object.entries(statsByProject)) {
        const cur = map.get(cwd) || sessionsByCwd.get(cwd) || { count: sessionsByCwd.get(cwd)?.count || 0, cost: 0, tokens: 0 };
        if (st && typeof st.cost === "number") cur.cost += st.cost;
        if (st && st.tokens && typeof st.tokens.total === "number") cur.tokens += st.tokens.total;
        map.set(cwd, cur);
      }
      // add remaining sessions without live stats
      for (const [cwd, v] of sessionsByCwd.entries()) if (!map.has(cwd)) map.set(cwd, v);
    } else {
      for (const [k,v] of sessionsByCwd.entries()) map.set(k,v);
    }
    return map;
  }

  function getProjectCosts(cwd, sessions, statsByProject) {
    const map = aggregateCostsByProject(sessions, statsByProject);
    return map.get(cwd) || { count: 0, cost: 0, tokens: 0 };
  }

  function formatProjectCost(entry, t) {
    const tr = t || ((k,v)=>k);
    const parts = [];
    if (entry.count) parts.push(entry.count === 1 ? "1 chat" : entry.count + " chat");
    if (entry.tokens) {
      const fmt = root.piUtils ? root.piUtils.fmtTokens(entry.tokens) : String(entry.tokens);
      parts.push(fmt + " tok");
    }
    if (entry.cost) {
      const fmt = root.piUtils ? root.piUtils.fmtCost(entry.cost) : "$" + entry.cost.toFixed(2);
      parts.push(fmt);
    }
    if (parts.length) return parts.join(" · ");
    try { const v = tr("costs.empty"); if (v && v !== "costs.empty") return v; } catch {}
    return "—";
  }

  function renderProjectCosts() {
    try {
      const el = root.piStore ? root.piStore.el : {};
      const state = root.piStore ? root.piStore.state : {};
      if (!el.statusTokens) return;
      const cwd = state.settings ? state.settings.cwd : null;
      const activeCwd = state.tabs && state.activeTabId ? (state.tabs.find(x=>x.id===state.activeTabId)?.cwd || cwd) : cwd;
      if (!activeCwd) return;
      const entry = getProjectCosts(activeCwd, state.sessions, null);
      // keep existing statusTokens but append project aggregate as tooltip/title
      if (el.statusCwd) {
        el.statusCwd.title = formatProjectCost(entry, root.i18n ? root.i18n.t : null) + " — " + activeCwd;
      }
    } catch {}
  }

  const api = { aggregateCostsByProject, getProjectCosts, formatProjectCost, renderProjectCosts };
  root.piCosts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
