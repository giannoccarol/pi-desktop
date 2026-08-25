"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const src = path.join(root, "scripts/hooks/pre-commit");
const dest = path.join(root, ".git/hooks/pre-commit");

if (!fs.existsSync(src)) {
  console.error("Hook sorgente non trovato:", src);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
fs.chmodSync(dest, 0o755);
console.log(`Hook installato: ${dest}`);

// Configura core.hooksPath se si vuole usare .githooks versionato (opzionale)
// spawnSync("git", ["config", "core.hooksPath", "scripts/hooks"], { cwd: root });
