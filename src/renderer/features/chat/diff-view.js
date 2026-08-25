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

  function renderDiff(toolName, args, output) {
    const name = String(toolName || "").toLowerCase();
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
    // Build HTML
    let html = `<div class="diff-view">`;
    if (parsedArgs.path || parsedArgs.file || parsedArgs.filePath) {
      const p = escapeHtml(parsedArgs.path || parsedArgs.file || parsedArgs.filePath);
      html += `<div class="diff-header"><span class="diff-path">${p}</span></div>`;
    }
    for (const hunk of parsed.hunks) {
      if (hunk.header) html += `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>`;
      html += `<div class="diff-lines">`;
      for (const line of hunk.lines) {
        const cls = line.type === "added" ? "added" : line.type === "removed" ? "removed" : "context";
        const marker = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
        // escape text but keep marker separate for styling
        html += `<div class="diff-line ${cls}"><span class="diff-marker">${marker}</span><span class="diff-text">${escapeHtml(line.text)}</span></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  const api = { parseUnifiedDiff, renderDiff, buildSyntheticDiff };
  root.piDiffView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
