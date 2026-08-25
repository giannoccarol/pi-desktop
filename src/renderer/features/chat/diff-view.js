"use strict";
/**
 * Diff view — pure functions for unified diff parsing & rendering.
 * No DOM until renderDiff; parseUnifiedDiff is pure.
 */
(function exposeDiff(root) {
  function escapeHtml(s) {
    if (root.piUtils && root.piUtils.escapeHtml) return root.piUtils.escapeHtml(s);
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function parseUnifiedDiff(raw) {
    const text = String(raw ?? "");
    if (!text.trim()) return { headers: [], hunks: [] };
    const lines = text.split("\n");
    const headers = [];
    const hunks = [];
    let current = null;
    for (const rawLine of lines) {
      const line = rawLine;
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        headers.push(line);
        continue;
      }
      if (line.startsWith("@@")) {
        current = { header: line, lines: [] };
        hunks.push(current);
        continue;
      }
      if (!current) {
        // no hunk yet — treat as single hunk
        current = { header: "", lines: [] };
        hunks.push(current);
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        current.lines.push({ type: "added", text: line.slice(1) });
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.lines.push({ type: "removed", text: line.slice(1) });
      } else if (line.startsWith(" ")) {
        current.lines.push({ type: "context", text: line.slice(1) });
      } else if (line === "") {
        current.lines.push({ type: "context", text: "" });
      } else {
        // fallback: treat as context without marker
        current.lines.push({ type: "context", text: line });
      }
    }
    return { headers, hunks };
  }

  function buildSyntheticDiff(args) {
    if (!args || typeof args !== "object") return null;
    const edits = Array.isArray(args.edits) ? args.edits : null;
    const items = edits ? edits : [args];
    const parts = [];
    for (const it of items) {
      const oldText = it.oldText ?? it.old_string ?? "";
      const newText = it.newText ?? it.new_string ?? it.content ?? "";
      if (oldText || newText) {
        parts.push({ oldText: String(oldText), newText: String(newText) });
      }
    }
    if (!parts.length) return null;
    // build synthetic unified diff lines
    let diff = "";
    for (const p of parts) {
      const oldLines = p.oldText ? p.oldText.split("\n") : [];
      const newLines = p.newText ? p.newText.split("\n") : [];
      // header
      diff += `@@ synthetic @@\n`;
      for (const l of oldLines) diff += `-${l}\n`;
      for (const l of newLines) diff += `+${l}\n`;
    }
    return diff;
  }

  function getDiffMode() {
    try {
      const v = (typeof localStorage !== "undefined" && localStorage.getItem("pi-diff-mode")) || "unified";
      return v === "split" ? "split" : "unified";
    } catch { return "unified"; }
  }
  function setDiffMode(mode) {
    try { if (typeof localStorage !== "undefined") localStorage.setItem("pi-diff-mode", mode === "split" ? "split" : "unified"); } catch {}
  }

  function renderReadPreview(toolName, args, output) {
    const name = String(toolName || "").toLowerCase();
    if (!["read", "grep", "find", "search", "ls"].includes(name)) return null;
    const parsedArgs = (() => {
      if (args && typeof args === "object") return args;
      if (typeof args === "string") { try { return JSON.parse(args); } catch { return {}; } }
      return {};
    })();
    const outStr = String(output ?? "");
    if (!outStr.trim()) return null;
    const filePath = parsedArgs.path || parsedArgs.file || parsedArgs.filePath || parsedArgs.filename || "";
    const escaped = escapeHtml(outStr.slice(0, 8000));
    const mode = getDiffMode();
    const pathHtml = filePath ? `<span class="diff-path">${escapeHtml(String(filePath))}</span>` : "";
    return `<div class="diff-view diff-read" data-mode="${mode}">` +
      `<div class="diff-header">${pathHtml}<span class="diff-tool-label">${escapeHtml(name)}</span>` +
      `<span class="diff-actions"><button class="diff-btn" data-action="copy" data-raw="${escapeHtml(outStr.slice(0,5000))}" title="Copia">Copia</button>` +
      (filePath ? `<button class="diff-btn" data-action="open" data-path="${escapeHtml(String(filePath))}" title="Apri file">Apri</button>` : "") +
      `</span></div>` +
      `<div class="diff-lines"><div class="diff-line context"><span class="diff-text">${escaped}</span></div></div></div>`;
  }

  function renderDiff(toolName, args, output) {
    const name = String(toolName || "").toLowerCase();
    // Try read preview first for non-edit tools
    if (["read", "grep", "find", "search", "ls"].includes(name)) {
      const preview = renderReadPreview(toolName, args, output);
      if (preview) return preview;
      return null;
    }
    if (!["edit", "write"].includes(name)) return null;
    const parsedArgs = (() => {
      if (args && typeof args === "object") return args;
      if (typeof args === "string") {
        try { return JSON.parse(args); } catch { return { value: args }; }
      }
      return {};
    })();
    let rawDiff = null;
    // 1) if output looks like unified diff, use it
    const outStr = String(output ?? "");
    if (outStr.includes("@@") || (outStr.includes("\n+") && outStr.includes("\n-"))) {
      // heuristic: contains hunk marker
      if (outStr.trim().startsWith("@@") || outStr.includes("\n@@") || outStr.startsWith("---") || outStr.startsWith("+++")) {
        rawDiff = outStr;
      } else if (outStr.includes("@@")) {
        rawDiff = outStr;
      }
    }
    // 2) else try synthetic from args
    if (!rawDiff) {
      const synth = buildSyntheticDiff(parsedArgs);
      if (synth) rawDiff = synth;
      else if (outStr && (outStr.includes("+") || outStr.includes("-"))) {
        // fallback: treat output as diff
        rawDiff = outStr;
      }
    }
    if (!rawDiff) return null;
    const parsed = parseUnifiedDiff(rawDiff);
    if (!parsed.hunks.length) return null;
    const mode = getDiffMode();
    // Build HTML with toolbar
    let html = `<div class="diff-view" data-mode="${mode}" data-raw="${escapeHtml(rawDiff.slice(0,8000))}">`;
    const p = parsedArgs.path || parsedArgs.file || parsedArgs.filePath;
    const pEsc = p ? escapeHtml(String(p)) : "";
    html += `<div class="diff-header">`;
    if (pEsc) html += `<span class="diff-path">${pEsc}</span>`;
    html += `<span class="diff-actions">` +
      `<button class="diff-btn" data-action="copy-diff" title="Copia diff">Copia diff</button>` +
      (pEsc ? `<button class="diff-btn" data-action="open" data-path="${pEsc}" title="Apri file">Apri</button>` : "") +
      `<button class="diff-btn" data-action="toggle" title="Toggle unified/split">${mode === "split" ? "Unificato" : "Split"}</button>` +
      `</span></div>`;
    if (mode === "split") {
      // finto split: two columns
      html += `<div class="diff-split">`;
      html += `<div class="diff-col diff-col-removed"><div class="diff-col-header">Rimosso</div>`;
      for (const hunk of parsed.hunks) {
        if (hunk.header) html += `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>`;
        for (const line of hunk.lines) {
          if (line.type === "removed" || line.type === "context") {
            const cls = line.type === "removed" ? "removed" : "context";
            const marker = line.type === "removed" ? "-" : " ";
            html += `<div class="diff-line ${cls}"><span class="diff-marker">${marker}</span><span class="diff-text">${escapeHtml(line.text)}</span></div>`;
          }
        }
      }
      html += `</div>`;
      html += `<div class="diff-col diff-col-added"><div class="diff-col-header">Aggiunto</div>`;
      for (const hunk of parsed.hunks) {
        if (hunk.header) html += `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>`;
        for (const line of hunk.lines) {
          if (line.type === "added" || line.type === "context") {
            const cls = line.type === "added" ? "added" : "context";
            const marker = line.type === "added" ? "+" : " ";
            html += `<div class="diff-line ${cls}"><span class="diff-marker">${marker}</span><span class="diff-text">${escapeHtml(line.text)}</span></div>`;
          }
        }
      }
      html += `</div></div>`;
    } else {
      for (const hunk of parsed.hunks) {
        if (hunk.header) html += `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>`;
        html += `<div class="diff-lines">`;
        for (const line of hunk.lines) {
          const cls = line.type === "added" ? "added" : line.type === "removed" ? "removed" : "context";
          const marker = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
          html += `<div class="diff-line ${cls}"><span class="diff-marker">${marker}</span><span class="diff-text">${escapeHtml(line.text)}</span></div>`;
        }
        html += `</div>`;
      }
    }
    html += `</div>`;
    return html;
  }

  function attachDiffActions(rootEl) {
    if (!rootEl) return;
    rootEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || !rootEl.contains(btn)) return;
      const action = btn.dataset.action;
      const view = btn.closest(".diff-view");
      if (action === "copy" || action === "copy-diff") {
        const raw = view?.dataset.raw || btn.dataset.raw || "";
        const text = raw || view?.textContent || "";
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
          else if (window.piDesktop && window.piDesktop.copy) window.piDesktop.copy(text);
          btn.textContent = "Copiato!";
          setTimeout(() => { btn.textContent = action === "copy" ? "Copia" : "Copia diff"; }, 1200);
        } catch {}
      } else if (action === "open") {
        const p = btn.dataset.path;
        if (p) {
          try {
            if (window.piDesktop && window.piDesktop.openExternal) window.piDesktop.openExternal(p);
            else if (window.piDesktop && window.piDesktop.openPath) window.piDesktop.openPath(p);
          } catch {}
        }
      } else if (action === "toggle") {
        const cur = getDiffMode();
        const next = cur === "split" ? "unified" : "split";
        setDiffMode(next);
        if (view) {
          view.dataset.mode = next;
          btn.textContent = next === "split" ? "Unificato" : "Split";
          // simple reload: toggle class, actual re-render will happen on next tool render; for now just toggle attribute
          try { view.classList.toggle("diff-split-mode", next === "split"); } catch {}
        }
      }
    });
  }

  const api = { parseUnifiedDiff, renderDiff, buildSyntheticDiff, renderReadPreview, getDiffMode, setDiffMode, attachDiffActions };
  root.piDiffView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
