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
    if (root.piUiSettings?.diffMode) {
      return root.piUiSettings.diffMode(root.piStore?.state?.settings);
    }
    try {
      const v = (typeof localStorage !== "undefined" && localStorage.getItem("pi-diff-mode")) || "unified";
      return v === "split" ? "split" : "unified";
    } catch { return "unified"; }
  }
  function setDiffMode(mode) {
    const resolved = mode === "split" ? "split" : "unified";
    if (root.piUiSettings?.persistDiffMode && root.piDesktop?.setSettings) {
      root.piUiSettings.persistDiffMode(root.piDesktop, resolved).catch((err) => {
        console.warn("[diff-mode]", err);
      });
    } else {
      try { if (typeof localStorage !== "undefined") localStorage.setItem("pi-diff-mode", resolved); } catch {}
    }
  }

  // --- modello righe allineate, come il compare di VS Code -------------------

  function parseHunkNums(header) {
    const m = /@@\s*-(\d+)(?:\s*,\s*(\d+))?\s*\+(\d+)(?:\s*,\s*(\d+))?/.exec(String(header || ""));
    if (!m) return null;
    return { oldStart: Number(m[1]), newStart: Number(m[3]) };
  }

  // Righe normalizzate: le coppie rimosso/aggiunto consecutive vengono
  // allineate sulla stessa riga (come la vista affiancata di VS Code).
  function hunkRows(hunk) {
    const nums = parseHunkNums(hunk.header);
    let oldNo = nums ? nums.oldStart : null;
    let newNo = nums ? nums.newStart : null;
    const rows = [];
    const L = hunk.lines;
    let i = 0;
    while (i < L.length) {
      const line = L[i];
      if (line.type === "context") {
        rows.push({
          kind: "context",
          old: oldNo == null ? { no: null, text: line.text } : { no: oldNo++, text: line.text },
          new: newNo == null ? { no: null, text: line.text } : { no: newNo++, text: line.text },
        });
        i++;
        continue;
      }
      const rem = [], add = [];
      while (i < L.length && L[i].type === "removed") rem.push({ no: oldNo == null ? null : oldNo++, text: L[i++].text });
      while (i < L.length && L[i].type === "added") add.push({ no: newNo == null ? null : newNo++, text: L[i++].text });
      const n = Math.max(rem.length, add.length) || 1;
      for (let k = 0; k < n; k++) rows.push({ kind: "change", old: rem[k] || null, new: add[k] || null });
    }
    return rows;
  }

  // Evidenzia la parte cambiata dentro la riga (prefisso/suffisso comuni),
  // così l'occhio vede subito cosa è cambiato senza leggere tutto.
  function changeRange(a, b) {
    const startMax = Math.min(a.length, b.length);
    let start = 0;
    while (start < startMax && a[start] === b[start]) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    return [start, endA, endB];
  }
  function escMark(text, range) {
    if (!range || range[0] >= range[1]) return escapeHtml(text) || "&nbsp;";
    return escapeHtml(text.slice(0, range[0])) +
      `<span class="diff-word">${escapeHtml(text.slice(range[0], range[1]))}</span>` +
      escapeHtml(text.slice(range[1]));
  }
  function escPlain(text) { return escapeHtml(text) || "&nbsp;"; }

  function unifiedHunkHtml(hunk) {
    let html = hunk.header ? `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>` : "";
    for (const row of hunkRows(hunk)) {
      if (row.kind === "context") {
        html += `<div class="diff-line context"><span class="diff-num">${row.old?.no ?? ""}</span><span class="diff-num">${row.new?.no ?? ""}</span><span class="diff-marker">&nbsp;</span><span class="diff-text">${escPlain(row.old?.text ?? "")}</span></div>`;
        continue;
      }
      if (row.old && row.new) {
        const [s, ea, eb] = changeRange(row.old.text, row.new.text);
        html += `<div class="diff-line removed"><span class="diff-num">${row.old.no ?? ""}</span><span class="diff-num"></span><span class="diff-marker">−</span><span class="diff-text">${escMark(row.old.text, [s, ea])}</span></div>`;
        html += `<div class="diff-line added"><span class="diff-num"></span><span class="diff-num">${row.new.no ?? ""}</span><span class="diff-marker">+</span><span class="diff-text">${escMark(row.new.text, [s, eb])}</span></div>`;
      } else if (row.old) {
        html += `<div class="diff-line removed"><span class="diff-num">${row.old.no ?? ""}</span><span class="diff-num"></span><span class="diff-marker">−</span><span class="diff-text">${escPlain(row.old.text)}</span></div>`;
      } else if (row.new) {
        html += `<div class="diff-line added"><span class="diff-num"></span><span class="diff-num">${row.new.no ?? ""}</span><span class="diff-marker">+</span><span class="diff-text">${escPlain(row.new.text)}</span></div>`;
      }
    }
    return html;
  }

  function splitHunkHtml(hunk) {
    let html = hunk.header ? `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>` : "";
    for (const row of hunkRows(hunk)) {
      let left, right;
      if (row.kind === "context") {
        left = `<div class="diff-half context"><span class="diff-num">${row.old?.no ?? ""}</span><span class="diff-marker">&nbsp;</span><span class="diff-text">${escPlain(row.old?.text ?? "")}</span></div>`;
        right = `<div class="diff-half context"><span class="diff-num">${row.new?.no ?? ""}</span><span class="diff-marker">&nbsp;</span><span class="diff-text">${escPlain(row.new?.text ?? "")}</span></div>`;
      } else if (row.old && row.new) {
        const [s, ea, eb] = changeRange(row.old.text, row.new.text);
        left = `<div class="diff-half removed"><span class="diff-num">${row.old.no ?? ""}</span><span class="diff-marker">−</span><span class="diff-text">${escMark(row.old.text, [s, ea])}</span></div>`;
        right = `<div class="diff-half added"><span class="diff-num">${row.new.no ?? ""}</span><span class="diff-marker">+</span><span class="diff-text">${escMark(row.new.text, [s, eb])}</span></div>`;
      } else if (row.old) {
        left = `<div class="diff-half removed"><span class="diff-num">${row.old.no ?? ""}</span><span class="diff-marker">−</span><span class="diff-text">${escPlain(row.old.text)}</span></div>`;
        right = `<div class="diff-half empty"><span class="diff-num"></span><span class="diff-marker"></span><span class="diff-text"></span></div>`;
      } else if (row.new) {
        left = `<div class="diff-half empty"><span class="diff-num"></span><span class="diff-marker"></span><span class="diff-text"></span></div>`;
        right = `<div class="diff-half added"><span class="diff-num">${row.new.no ?? ""}</span><span class="diff-marker">+</span><span class="diff-text">${escPlain(row.new.text)}</span></div>`;
      }
      html += `<div class="diff-row-split">${left}${right}</div>`;
    }
    return html;
  }

  function diffBodyHtml(parsed, mode) {
    const perHunk = mode === "split" ? splitHunkHtml : unifiedHunkHtml;
    return parsed.hunks.map(perHunk).join("");
  }

  function renderDiffInner(rawDiff, mode, opts) {
    const parsed = parseUnifiedDiff(rawDiff);
    if (!parsed.hunks.length) return null;
    const o = opts || {};
    let html = `<div class="diff-header">`;
    if (o.path) html += `<span class="diff-path">${escapeHtml(o.path)}</span>`;
    html += `<span class="diff-actions">` +
      `<button class="diff-btn" data-action="copy-diff" title="Copia diff">Copia diff</button>` +
      (o.path ? `<button class="diff-btn" data-action="open" data-path="${escapeHtml(o.path)}" title="Apri file">Apri</button>` : "") +
      (o.newText ? `<button class="diff-btn" data-action="edit-inline" data-newtext="${escapeHtml(o.newText)}" title="Prepara una proposta nel composer">Proponi modifica</button>` : "") +
      `<button class="diff-btn" data-action="toggle" title="Cambia vista">${mode === "split" ? "Unificato" : "Affiancato"}</button>` +
      `</span></div>`;
    html += `<div class="diff-body diff-${mode === "split" ? "split" : "unified"}">${diffBodyHtml(parsed, mode)}</div>`;
    return html;
  }

  // Ridisegna una .diff-view esistente (anche nei cloni del pannello Modifiche):
  // il diff grezzo vive in data-raw, quindi il toggle funziona subito.
  function rerenderDiffView(view) {
    if (!view || view.classList.contains("diff-read")) return false;
    const raw = view.dataset.raw;
    if (!raw) return false;
    const mode = getDiffMode();
    const inner = renderDiffInner(raw, mode, { path: view.dataset.path || "", newText: view.dataset.newtext || "" });
    if (!inner) return false;
    view.dataset.mode = mode;
    view.innerHTML = inner;
    return true;
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
      `<pre class="diff-raw">${escaped}</pre></div>`;
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
    const mode = getDiffMode();
    const p = parsedArgs.path || parsedArgs.file || parsedArgs.filePath;
    const pStr = p ? String(p) : "";
    const newTextForEdit = (()=>{ try{ const a = typeof parsedArgs==='object'?parsedArgs:JSON.parse(String(parsedArgs)); const v = a.newText ?? a.new_string ?? a.content ?? ""; return String(v).slice(0,8000); }catch{ return ""; } })();
    const inner = renderDiffInner(rawDiff, mode, { path: pStr, newText: newTextForEdit });
    if (!inner) return null;
    return `<div class="diff-view" data-mode="${mode}" data-raw="${escapeHtml(rawDiff.slice(0,8000))}" data-path="${escapeHtml(pStr)}"${newTextForEdit ? ` data-newtext="${escapeHtml(newTextForEdit)}"` : ""}>${inner}</div>`;
  }

  function attachDiffActions(rootEl) {
    if (!rootEl) return;
    rootEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || !rootEl.contains(btn)) return;
      const action = btn.dataset.action;
      const view = btn.closest(".diff-view");
      if(action==="edit-inline"){
        const cur = btn.dataset.newtext || "";
        if(view.querySelector(".diff-inline-editor")) return;
        const wrap=document.createElement("div"); wrap.className="diff-inline-editor"; wrap.style.cssText="padding:8px;background:var(--surface-2);border-top:1px solid var(--hairline)";
        wrap.innerHTML=`<textarea style="width:100%;min-height:100px;font:12px var(--mono);padding:8px;border-radius:6px;border:1px solid var(--hairline)">${escapeHtml(cur)}</textarea><div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px"><button class="btn ghost small" data-inline="cancel">Annulla</button><button class="btn primary small" data-inline="apply">Applica nel composer</button></div>`;
        view.appendChild(wrap);
        const ta=wrap.querySelector("textarea"); ta.focus();
        wrap.querySelector('[data-inline="cancel"]')?.addEventListener("click", ()=> wrap.remove());
        wrap.querySelector('[data-inline="apply"]')?.addEventListener("click", ()=>{
          const val=ta.value;
          const inp = document.querySelector("#input");
          if(inp){
            const path = view.querySelector(".diff-path")?.textContent?.trim() || "file";
            inp.value = (inp.value? inp.value+"\n" : "") + `Modifica ${path}:\n\`\`\`\n${val}\n\`\`\``;
            inp.focus();
            try{ window.piComposer?.autosize?.(); }catch{}
          }
          try{ navigator.clipboard.writeText(val); }catch{}
          wrap.remove();
          if(root.piUi?.toast) root.piUi.toast("Proposta inserita nel composer","info",3000);
        });
        return;
      }
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
            const cwd=window.piStore?.state?.settings?.cwd || "";
            const absolute=/^(?:[A-Za-z]:[\\/]|\/)/.test(p) ? p : `${cwd.replace(/[\\/]+$/,"")}/${p}`;
            const normalized=absolute.replace(/\\/g,"/");
            const fileUrl=/^[A-Za-z]:\//.test(normalized) ? `file:///${normalized}` : `file://${normalized}`;
            if (window.piDesktop && window.piDesktop.openExternal) window.piDesktop.openExternal(encodeURI(fileUrl));
            else if (window.piDesktop && window.piDesktop.openPath) window.piDesktop.openPath(p);
          } catch {}
        }
      } else if (action === "toggle") {
        const next = getDiffMode() === "split" ? "unified" : "split";
        setDiffMode(next);
        // ridisegna subito la vista (vale anche per i cloni del pannello Modifiche)
        if (!rerenderDiffView(view)) {
          if (view) {
            view.dataset.mode = next;
            btn.textContent = next === "split" ? "Unificato" : "Affiancato";
          }
        }
      }
    });
  }

  const api = { parseUnifiedDiff, renderDiff, buildSyntheticDiff, renderReadPreview, getDiffMode, setDiffMode, rerenderDiffView, attachDiffActions };
  root.piDiffView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
