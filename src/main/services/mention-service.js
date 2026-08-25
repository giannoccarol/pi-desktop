"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const MENTION_SKIP_DIRS = new Set([
  ".git", ".hg", ".svn", "node_modules", ".cache", ".next", ".nuxt",
  "dist", "build", "out", "coverage", "__pycache__", ".venv", "venv",
  "target", ".idea", ".vscode", ".pi",
]);

function listProjectFiles(root) {
  return new Promise((resolve) => {
    execFile("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root, maxBuffer: 16 * 1024 * 1024, timeout: 3000,
    }, (err, stdout) => {
      if (!err && stdout.length) {
        resolve(stdout.split("\0").filter(Boolean));
        return;
      }
      (async () => {
        const results = [];
        const pending = [{ dir: root, rel: "" }];
        while (pending.length && results.length < 8000) {
          const current = pending.pop();
          let entries;
          try { entries = await fs.promises.readdir(current.dir, { withFileTypes: true }); }
          catch { continue; }
          for (const entry of entries) {
            const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              if (MENTION_SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
              pending.push({ dir: path.join(current.dir, entry.name), rel });
            } else if (entry.isFile()) {
              results.push(rel);
              if (results.length >= 8000) break;
            }
          }
        }
        resolve(results);
      })().catch(() => resolve([]));
    });
  });
}

function scoreMentionCandidate(relPath, query, isDir) {
  const lowerPath = relPath.toLowerCase();
  const base = path.posix.basename(relPath).toLowerCase();
  let score = 0;
  if (query) {
    const q = query.toLowerCase().replace(/^\.?\//, "");
    if (base === q) score += 200;
    else if (base.startsWith(q)) score += 120;
    else if (lowerPath.includes(q)) score += 60;
    else {
      let i = 0;
      for (const ch of lowerPath) {
        if (ch === q[i]) i++;
        if (i >= q.length) break;
      }
      if (i < q.length) return -1;
      score += 10;
    }
  }
  if (isDir) score += 4;
  score += Math.max(0, 20 - relPath.split("/").length * 2);
  score += Math.max(0, 10 - Math.max(0, relPath.length - 20) / 8);
  return score;
}

function createMentionService(getCwd) {
  let cache = { root: null, at: 0, files: null, pending: null };

  async function cachedProjectFiles(root) {
    const now = Date.now();
    if (cache.root === root && cache.files && now - cache.at < 10000) {
      return cache.files;
    }
    if (cache.root === root && cache.pending) return cache.pending;
    const pending = listProjectFiles(root).then((files) => {
      if (cache.root === root) {
        cache.files = files;
        cache.at = Date.now();
        cache.pending = null;
      }
      return files;
    });
    cache = { root, at: 0, files: null, pending };
    return pending;
  }

  async function searchMentionCandidates(rawQuery) {
    const root = getCwd();
    if (!root || !fs.existsSync(root)) return [];
    const files = await cachedProjectFiles(root);
    const query = String(rawQuery || "");
    const seen = new Set();
    const candidates = [];
    for (const rel of files) {
      const segments = rel.split("/");
      for (let i = 1; i < segments.length; i++) {
        const dir = segments.slice(0, i).join("/");
        if (!seen.has(dir)) {
          seen.add(dir);
          candidates.push({ path: dir, dir: true });
        }
      }
      seen.add(rel);
      candidates.push({ path: rel, dir: false });
    }
    return candidates
      .map((c) => ({ ...c, score: scoreMentionCandidate(c.path, query, c.dir) }))
      .filter((c) => c.score >= 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 12)
      .map(({ path: p, dir }) => ({ path: p, dir }));
  }

  function _resetCache() { cache = { root: null, at: 0, files: null, pending: null }; }
  function _setCache(c) { cache = c; }

  return { listProjectFiles, scoreMentionCandidate, cachedProjectFiles, searchMentionCandidates, _resetCache, _setCache, MENTION_SKIP_DIRS };
}

module.exports = { MENTION_SKIP_DIRS, listProjectFiles, scoreMentionCandidate, createMentionService };
