"use strict";
// Drag & Drop folder/file preview for composer.
// Loaded after store/composer, before bootstrap. Exposes window.piDragDrop.
// Pure functions are testable via Node; DOM wiring is opt-in via initDragDrop().

(function exposeDragDrop(root) {
  const SKIP_DIRS = new Set([
    ".git", ".hg", ".svn", "node_modules", ".cache", ".next", ".nuxt",
    "dist", "build", "out", "coverage", "__pycache__", ".venv", "venv",
    "target", ".idea", ".vscode", ".pi",
  ]);

  function basename(p) {
    if (!p) return "";
    return String(p).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  }

  // Pure: filter out paths whose any segment is in SKIP_DIRS or starts with "."
  function filterIgnoredPaths(paths) {
    if (!Array.isArray(paths)) return [];
    return paths.filter((p) => {
      const segs = String(p).split("/").filter(Boolean);
      for (const s of segs) {
        if (SKIP_DIRS.has(s)) return false;
        if (s.startsWith(".") && s.length > 1) {
          // allow hidden files only if explicitly requested? filter by default
          // But keep .pi filtered already, otherwise ignore dotfiles
          // For now, filter dotfiles as well to keep tree clean
          return false;
        }
      }
      return true;
    });
  }

  // Pure: normalize entry to {path, dir}
  function normalizeEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map((e) => {
      if (typeof e === "string") {
        const raw = String(e).replace(/\\/g, "/").replace(/^\/+/, "");
        const isDir = raw.endsWith("/");
        const path = isDir ? raw.replace(/\/+$/, "") : raw;
        // Heuristic: if string ends with "/" -> dir, else infer dir if no extension and caller passed dir flag elsewhere
        return { path, dir: isDir };
      }
      if (e && typeof e === "object") {
        const p = String(e.path || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
        return { path: p, dir: Boolean(e.dir) };
      }
      return null;
    }).filter(Boolean).filter((e) => e.path);
  }

  // Pure: build nested tree from entries [{path, dir}]
  // Returns root node { name:"", path:"", isFile:false, children: Map<string, node> }
  // For test convenience, children is plain object for JSON-friendly, but we use Map-like object.
  function buildFileTree(entries) {
    const normalized = normalizeEntries(entries);
    const filtered = normalized.filter((e) => filterIgnoredPaths([e.path]).length);
    const root = { name: "", path: "", isFile: false, children: {} };
    for (const entry of filtered) {
      const parts = entry.path.split("/").filter(Boolean);
      let node = root;
      let curPath = "";
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        curPath = curPath ? `${curPath}/${part}` : part;
        const isLast = i === parts.length - 1;
        const isFile = isLast ? !entry.dir : false;
        if (!node.children[part]) {
          node.children[part] = { name: part, path: curPath, isFile, children: {}, dir: !isFile };
          // If intermediate node was previously a file, convert to dir
          if (!isLast) {
            node.children[part].isFile = false;
            node.children[part].dir = true;
          }
        } else {
          // existing node: if this entry is deeper, ensure dir
          if (!isLast) {
            node.children[part].isFile = false;
            node.children[part].dir = true;
          } else if (!entry.dir) {
            // keep as file if last and not dir
            // but if previously dir, keep dir (folder takes precedence)
            if (!node.children[part].dir) node.children[part].isFile = true;
          }
        }
        node = node.children[part];
      }
    }
    return root;
  }

  // Pure: collect all file paths (leaf files) from tree
  function collectFilePaths(tree) {
    const out = [];
    function walk(node) {
      if (!node) return;
      if (node.isFile) {
        out.push(node.path);
        return;
      }
      const kids = node.children ? Object.values(node.children) : [];
      for (const child of kids) walk(child);
    }
    // root may have children directly
    if (tree.children) {
      for (const child of Object.values(tree.children)) walk(child);
    } else {
      walk(tree);
    }
    return out;
  }

  // Pure: collect all paths (files + dirs) for selection handling
  function collectAllPaths(tree) {
    const out = [];
    function walk(node) {
      if (node.path) out.push(node.path);
      const kids = node.children ? Object.values(node.children) : [];
      for (const child of kids) walk(child);
    }
    if (tree.children) {
      for (const child of Object.values(tree.children)) walk(child);
    }
    return out;
  }

  // Pure: given a Set of selected paths (files or dirs), expand dir selections to contained files
  function expandSelectionToFiles(tree, selectedSet) {
    const selected = selectedSet instanceof Set ? selectedSet : new Set(selectedSet || []);
    const allFiles = collectFilePaths(tree);
    // Build map path -> node for quick lookup
    const pathToNode = new Map();
    function index(node) {
      if (node.path) pathToNode.set(node.path, node);
      for (const child of Object.values(node.children || {})) index(child);
    }
    index(tree);
    const result = [];
    for (const file of allFiles) {
      // file is selected if itself or any ancestor dir is selected
      const segs = file.split("/");
      let cur = "";
      let matched = false;
      for (let i = 0; i < segs.length; i++) {
        cur = cur ? `${cur}/${segs[i]}` : segs[i];
        if (selected.has(cur)) { matched = true; break; }
      }
      if (matched) result.push(file);
    }
    return result;
  }

  // Pure helper for toggle-all logic
  function toggleSelection(selectedSet, path, tree, checked) {
    const next = new Set(selectedSet || []);
    if (checked) next.add(path);
    else next.delete(path);
    // If toggling a dir, also add/remove its descendants for UI consistency (optional)
    // We keep descendants implicit; expandSelectionToFiles handles expansion.
    // For UI, we sync children checkboxes via walk, but Set stays minimal.
    return next;
  }

  // ── DOM helpers ──────────────────────────────────────────────
  function getEl() { return (root.piStore && root.piStore.el) || {}; }
  function getState() { return (root.piStore && root.piStore.state) || {}; }
  function getApi() { return root.piDesktop || {}; }
  function toast(m,k,ms){ return root.piUi ? root.piUi.toast(m,k,ms) : void 0; }
  function icon(n){ return root.piUi ? root.piUi.icon(n) : `<i data-lucide="${n}"></i>`; }
  function refreshIcons(){ return root.piUi ? root.piUi.refreshIcons() : void 0; }

  let currentTree = null;
  let currentSelection = new Set();
  let currentDroppedAbsPaths = [];

  function renderDropPreview(tree, selection) {
    const el = getEl();
    const container = el.dropPreview || document.getElementById("drop-preview");
    if (!container) return;
    container.innerHTML = "";
    if (!tree || !Object.keys(tree.children || {}).length) {
      container.classList.add("hidden");
      return;
    }
    const header = document.createElement("div");
    header.className = "drop-preview-head";
    header.innerHTML = `${icon("folder-tree")}<strong>Cartella rilasciata</strong><span class="muted small">${collectFilePaths(tree).length} file</span>`;
    const actions = document.createElement("div");
    actions.className = "drop-preview-actions";
    const btnAll = document.createElement("button");
    btnAll.className = "btn small";
    btnAll.textContent = "Tutti";
    btnAll.addEventListener("click", () => {
      const all = collectAllPaths(tree);
      currentSelection = new Set(all.filter((p) => {
        const node = findNode(tree, p);
        return node && node.isFile;
      }));
      // also select dirs for convenience
      for (const p of collectAllPaths(tree)) {
        const n = findNode(tree, p);
        if (n && !n.isFile) currentSelection.add(p);
      }
      renderDropPreview(tree, currentSelection);
    });
    const btnNone = document.createElement("button");
    btnNone.className = "btn small ghost";
    btnNone.textContent = "Nessuno";
    btnNone.addEventListener("click", () => {
      currentSelection = new Set();
      renderDropPreview(tree, currentSelection);
    });
    const btnAdd = document.createElement("button");
    btnAdd.className = "btn small primary";
    btnAdd.textContent = `Aggiungi ${expandSelectionToFiles(tree, selection).length || 0}`;
    btnAdd.addEventListener("click", () => confirmDropSelection());
    const btnClose = document.createElement("button");
    btnClose.className = "icon-btn tiny";
    btnClose.innerHTML = icon("x");
    btnClose.title = "Chiudi";
    btnClose.addEventListener("click", () => hideDropPreview());
    actions.append(btnAll, btnNone, btnAdd, btnClose);
    header.appendChild(actions);
    container.appendChild(header);

    const treeEl = document.createElement("div");
    treeEl.className = "drop-tree";
    function renderNode(node, depth) {
      const row = document.createElement("div");
      row.className = "drop-tree-row";
      row.style.paddingLeft = `${8 + depth * 14}px`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selection.has(node.path);
      // indeterminate if some children selected
      const childFiles = collectFilePaths({ children: { [node.name]: node } });
      const expanded = expandSelectionToFiles(tree, selection);
      const someChildSelected = childFiles.some((f) => expanded.includes(f));
      const allChildSelected = childFiles.length && childFiles.every((f) => expanded.includes(f));
      if (!cb.checked && someChildSelected) cb.indeterminate = true;
      if (allChildSelected && !node.isFile) cb.checked = true;

      cb.addEventListener("change", () => {
        const checked = cb.checked;
        // toggle this node and all descendants
        const toToggle = [];
        function collect(n) { toToggle.push(n.path); for (const c of Object.values(n.children || {})) collect(c); }
        collect(node);
        const next = new Set(selection);
        for (const p of toToggle) {
          if (checked) next.add(p);
          else next.delete(p);
        }
        // If unchecking a file, also uncheck ancestors (they were indeterminate)
        if (!checked) {
          // keep ancestors unchecked – they will be indeterminate via render
        }
        currentSelection = next;
        renderDropPreview(tree, next);
      });

      const label = document.createElement("label");
      label.className = "drop-tree-label";
      const iconName = node.isFile ? "file" : "folder";
      label.innerHTML = `${icon(iconName)}<span class="drop-tree-name"></span>`;
      label.querySelector(".drop-tree-name").textContent = node.name;
      label.prepend(cb);
      row.appendChild(label);

      // For dirs, add expand/collapse
      if (!node.isFile && Object.keys(node.children || {}).length) {
        row.classList.add("dir");
        const toggle = document.createElement("button");
        toggle.className = "drop-tree-toggle";
        toggle.innerHTML = icon("chevron-down");
        toggle.addEventListener("click", () => {
          const sub = row.nextElementSibling;
          if (sub && sub.classList.contains("drop-tree-children")) {
            sub.classList.toggle("hidden");
            row.classList.toggle("collapsed");
          }
        });
        row.prepend(toggle);
      }
      treeEl.appendChild(row);
      if (!node.isFile && Object.keys(node.children || {}).length) {
        const childrenWrap = document.createElement("div");
        childrenWrap.className = "drop-tree-children";
        // temporarily append to measure, then render children
        treeEl.appendChild(childrenWrap);
        for (const child of Object.values(node.children).sort((a,b)=> (a.isFile===b.isFile? a.name.localeCompare(b.name) : a.isFile?1:-1))) {
          const childRows = renderNode(child, depth+1);
          // childRows already appended to treeEl, need to move into childrenWrap
          // Instead, we collect and append to childrenWrap manually
        }
        // Rework: render children into childrenWrap directly
        // Remove the placeholder we just added and re-render
        treeEl.removeChild(childrenWrap);
        const wrap = document.createElement("div");
        wrap.className = "drop-tree-children";
        for (const child of Object.values(node.children).sort((a,b)=> (a.isFile===b.isFile? a.name.localeCompare(b.name) : a.isFile?1:-1))) {
          // recursive call that appends to wrap
          (function renderInto(parent, n, d){
            const r = document.createElement("div");
            r.className = "drop-tree-row";
            r.style.paddingLeft = `${8 + d * 14}px`;
            const c = document.createElement("input");
            c.type = "checkbox";
            c.checked = selection.has(n.path);
            const cf = collectFilePaths({ children: { [n.name]: n } });
            const ex = expandSelectionToFiles(tree, selection);
            const some = cf.some((f)=> ex.includes(f));
            const all = cf.length && cf.every((f)=> ex.includes(f));
            if (!c.checked && some) c.indeterminate = true;
            if (all && !n.isFile) c.checked = true;
            c.addEventListener("change", () => {
              const chk = c.checked;
              const toTog = [];
              function col(m){ toTog.push(m.path); for(const ch of Object.values(m.children||{})) col(ch); }
              col(n);
              const nxt = new Set(selection);
              for(const p of toTog){ if(chk) nxt.add(p); else nxt.delete(p); }
              currentSelection = nxt;
              renderDropPreview(tree, nxt);
            });
            const lab = document.createElement("label");
            lab.className = "drop-tree-label";
            lab.innerHTML = `${icon(n.isFile?"file":"folder")}<span class="drop-tree-name"></span>`;
            lab.querySelector(".drop-tree-name").textContent = n.name;
            lab.prepend(c);
            r.appendChild(lab);
            if (!n.isFile && Object.keys(n.children||{}).length) {
              r.classList.add("dir");
              const tg = document.createElement("button");
              tg.className = "drop-tree-toggle";
              tg.innerHTML = icon("chevron-down");
              tg.addEventListener("click", ()=>{
                const s = r.nextElementSibling;
                if(s) { s.classList.toggle("hidden"); r.classList.toggle("collapsed"); }
              });
              r.prepend(tg);
            }
            parent.appendChild(r);
            if (!n.isFile && Object.keys(n.children||{}).length) {
              const w = document.createElement("div");
              w.className = "drop-tree-children";
              for(const ch of Object.values(n.children).sort((a,b)=> (a.isFile===b.isFile? a.name.localeCompare(b.name) : a.isFile?1:-1))){
                renderInto(w, ch, d+1);
              }
              parent.appendChild(w);
            }
          })(wrap, child, depth+1);
        }
        treeEl.appendChild(wrap);
      }
      return row;
    }

    // simpler flat render: just render top-level children
    for (const child of Object.values(tree.children).sort((a,b)=> (a.isFile===b.isFile? a.name.localeCompare(b.name) : a.isFile?1:-1))) {
      // use helper to render into treeEl
      (function renderTop(n){
        const row = document.createElement("div");
        row.className = "drop-tree-row";
        row.style.paddingLeft = "8px";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selection.has(n.path);
        const cf = collectFilePaths({ children: { [n.name]: n } });
        const ex = expandSelectionToFiles(tree, selection);
        const some = cf.some((f)=> ex.includes(f));
        const all = cf.length && cf.every((f)=> ex.includes(f));
        if (!cb.checked && some) cb.indeterminate = true;
        if (all && !n.isFile) cb.checked = true;
        cb.addEventListener("change", () => {
          const chk = cb.checked;
          const toTog = [];
          function col(m){ toTog.push(m.path); for(const ch of Object.values(m.children||{})) col(ch); }
          col(n);
          const nxt = new Set(selection);
          for(const p of toTog){ if(chk) nxt.add(p); else nxt.delete(p); }
          currentSelection = nxt;
          renderDropPreview(tree, nxt);
        });
        const label = document.createElement("label");
        label.className = "drop-tree-label";
        label.innerHTML = `${icon(n.isFile?"file":"folder")}<span class="drop-tree-name"></span>`;
        label.querySelector(".drop-tree-name").textContent = n.name;
        label.prepend(cb);
        row.appendChild(label);
        if (!n.isFile && Object.keys(n.children||{}).length) {
          row.classList.add("dir");
          const tg = document.createElement("button");
          tg.className = "drop-tree-toggle";
          tg.innerHTML = icon("chevron-down");
          tg.addEventListener("click", ()=>{
            const s = row.nextElementSibling;
            if(s){ s.classList.toggle("hidden"); row.classList.toggle("collapsed"); }
          });
          row.prepend(tg);
        }
        treeEl.appendChild(row);
        if (!n.isFile && Object.keys(n.children||{}).length) {
          const wrap = document.createElement("div");
          wrap.className = "drop-tree-children";
          for(const ch of Object.values(n.children).sort((a,b)=> (a.isFile===b.isFile? a.name.localeCompare(b.name) : a.isFile?1:-1))){
            (function rec(parent, node, d){
              const r = document.createElement("div");
              r.className = "drop-tree-row";
              r.style.paddingLeft = `${8 + d * 14}px`;
              const c2 = document.createElement("input");
              c2.type = "checkbox";
              c2.checked = selection.has(node.path);
              const cf2 = collectFilePaths({ children: { [node.name]: node } });
              const ex2 = expandSelectionToFiles(tree, selection);
              const some2 = cf2.some((f)=> ex2.includes(f));
              const all2 = cf2.length && cf2.every((f)=> ex2.includes(f));
              if (!c2.checked && some2) c2.indeterminate = true;
              if (all2 && !node.isFile) c2.checked = true;
              c2.addEventListener("change", () => {
                const chk = c2.checked;
                const toTog2 = [];
                function col2(m){ toTog2.push(m.path); for(const ch of Object.values(m.children||{})) col2(ch); }
                col2(node);
                const nxt2 = new Set(selection);
                for(const p of toTog2){ if(chk) nxt2.add(p); else nxt2.delete(p); }
                currentSelection = nxt2;
                renderDropPreview(tree, nxt2);
              });
              const lab2 = document.createElement("label");
              lab2.className = "drop-tree-label";
              lab2.innerHTML = `${icon(node.isFile?"file":"folder")}<span class="drop-tree-name"></span>`;
              lab2.querySelector(".drop-tree-name").textContent = node.name;
              lab2.prepend(c2);
              r.appendChild(lab2);
              if (!node.isFile && Object.keys(node.children||{}).length) {
                r.classList.add("dir");
                const tg2 = document.createElement("button");
                tg2.className = "drop-tree-toggle";
                tg2.innerHTML = icon("chevron-down");
                tg2.addEventListener("click", ()=>{
                  const s = r.nextElementSibling;
                  if(s){ s.classList.toggle("hidden"); r.classList.toggle("collapsed"); }
                });
                r.prepend(tg2);
              }
              parent.appendChild(r);
              if (!node.isFile && Object.keys(node.children||{}).length) {
                const w2 = document.createElement("div");
                w2.className = "drop-tree-children";
                for(const ch of Object.values(node.children).sort((a,b)=> (a.isFile===b.isFile? a.name.localeCompare(b.name) : a.isFile?1:-1))){
                  rec(w2, ch, d+1);
                }
                parent.appendChild(w2);
              }
            })(wrap, ch, 1);
          }
          treeEl.appendChild(wrap);
        }
      })(child);
    }

    container.appendChild(treeEl);
    container.classList.remove("hidden");
    refreshIcons();
    // update add button count
    const addBtn = container.querySelector(".drop-preview-actions .primary");
    if (addBtn) addBtn.textContent = `Aggiungi ${expandSelectionToFiles(tree, selection).length || 0}`;
  }

  function findNode(tree, path) {
    const parts = path.split("/").filter(Boolean);
    let node = tree;
    for (const part of parts) {
      if (!node.children || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }

  function hideDropPreview() {
    const el = getEl();
    const container = el.dropPreview || document.getElementById("drop-preview");
    if (container) {
      container.classList.add("hidden");
      container.innerHTML = "";
    }
    currentTree = null;
    currentSelection = new Set();
    currentDroppedAbsPaths = [];
  }

  function confirmDropSelection() {
    const state = getState();
    const el = getEl();
    if (!currentTree) return;
    const files = expandSelectionToFiles(currentTree, currentSelection);
    // Map relative paths to absolute if we have base
    // For dropped absolute folder, files are relative to that folder; need to prepend base
    let toAdd = files;
    if (currentDroppedAbsPaths.length === 1 && files.length) {
      // if single dropped dir, prepend its dir name? Actually files already contain relative paths inside dropped dir
      // We need absolute paths for attachments: join droppedAbs + "/" + file
      // But we lost base mapping. For now, if dropped was a folder, currentTree paths are relative to dropped folder's children,
      // not absolute. We need to store base.
      // Use _dropBase stored globally
      if (root._dropBase) {
        toAdd = files.map((f) => `${root._dropBase}/${f}`);
        // If dropped file was at root, f already is base-relative, but if we dropped file directly, _dropBase is its dir
      }
    } else if (currentDroppedAbsPaths.length > 1) {
      // multiple dropped items: each file path in tree is already absolute-like? For multiple, we kept paths as basenames?
      // For simplicity, treat files as already absolute if they contain "/"
      // This path handling is best-effort; main misuse is adding relative path which pi can still resolve via cwd.
    }

    // Add to attachments (state.attachments)
    if (!state.attachments) state.attachments = [];
    for (const rel of toAdd) {
      const absOrRel = rel;
      const name = basename(absOrRel);
      if (state.attachments.some((c) => c.path === absOrRel)) continue;
      if (state.attachments.length >= 12) {
        toast("Limite di 12 allegati raggiunto.", "warn");
        break;
      }
      state.attachments.push({
        name,
        path: absOrRel,
        size: 0,
        mimeType: null,
        data: null,
      });
    }
    // Render tray
    if (root.piComposer && root.piComposer.renderAttachmentTray) root.piComposer.renderAttachmentTray();
    else if (typeof renderAttachmentTray === "function") renderAttachmentTray();
    hideDropPreview();
    const input = el.input;
    if (input) input.focus();
  }

  async function handleDrop(event) {
    const el = getEl();
    const dt = event.dataTransfer;
    if (!dt) return;
    const files = [...(dt.files || [])];
    if (!files.length) return;
    // In Electron, File has .path property with absolute path
    const absPaths = files.map((f) => f.path || f.name).filter(Boolean);
    if (!absPaths.length) return;

    // If multiple, we need to handle each; for single folder we try to enumerate via API
    const api = getApi();
    let entries = [];
    // Quick: try to list dropped folder via API if available
    for (const abs of absPaths) {
      const isDirHint = !abs.includes(".") || abs.endsWith("/") || abs.split("/").pop().indexOf(".")===-1;
      // Attempt to call listDropped if API exists and path looks like dir
      if (api.listDroppedFiles && isDirHint) {
        try {
          const listed = await api.listDroppedFiles(abs);
          if (Array.isArray(listed) && listed.length) {
            // listed are relative paths inside abs
            for (const rel of listed) {
              entries.push({ path: rel, dir: false });
              // also ensure dirs? listDropped returns files only, dirs are implicit
            }
            // store base for later absolute mapping
            root._dropBase = abs;
            continue;
          }
        } catch {}
      }
      // fallback: treat as single file/folder entry
      const baseName = basename(abs);
      // For folder fallback, we don't have enumeration, so just add as dir entry
      // Use the basename as path for tree display
      entries.push({ path: baseName, dir: isDirHint });
      if (absPaths.length === 1) root._dropBase = abs;
    }

    // Filter and build tree
    const filteredEntries = entries.filter((e) => filterIgnoredPaths([e.path]).length);
    if (!filteredEntries.length) {
      toast("Nessun file valido nel drop (filtrati).", "warn");
      return;
    }
    currentTree = buildFileTree(filteredEntries);
    // Initially select all files
    const allFiles = collectFilePaths(currentTree);
    currentSelection = new Set(allFiles);
    // Also select dirs for UI
    for (const p of collectAllPaths(currentTree)) {
      const n = findNode(currentTree, p);
      if (n && !n.isFile) currentSelection.add(p);
    }
    currentDroppedAbsPaths = absPaths;
    renderDropPreview(currentTree, currentSelection);
  }

  function initDragDrop() {
    const el = getEl();
    const composer = el.composer || document.getElementById("composer");
    const wrap = el.composerWrap || document.getElementById("composer-wrap");
    const target = composer || wrap;
    if (!target) return;
    // Create drop-preview container if not exists
    let preview = el.dropPreview || document.getElementById("drop-preview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "drop-preview";
      preview.className = "drop-preview hidden";
      if (composer) composer.appendChild(preview);
      else target.appendChild(preview);
      if (el) el.dropPreview = preview;
    }

    const onDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      target.classList.add("drag-over");
    };
    const onDragLeave = (e) => {
      // only remove if leaving target
      if (!target.contains(e.relatedTarget)) target.classList.remove("drag-over");
    };
    const onDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      target.classList.remove("drag-over");
      await handleDrop(e);
    };
    target.addEventListener("dragover", onDragOver);
    target.addEventListener("dragenter", onDragOver);
    target.addEventListener("dragleave", onDragLeave);
    target.addEventListener("drop", onDrop);
  }

  const api = {
    SKIP_DIRS,
    filterIgnoredPaths,
    normalizeEntries,
    buildFileTree,
    collectFilePaths,
    collectAllPaths,
    expandSelectionToFiles,
    toggleSelection,
    renderDropPreview,
    hideDropPreview,
    confirmDropSelection,
    handleDrop,
    initDragDrop,
    findNode,
  };

  root.piDragDrop = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
