"use strict";

// Avvia Electron senza ELECTRON_RUN_AS_NODE (impostato da Cursor/VS Code),
// che altrimenti fa trattare il processo come Node puro e require("electron") restituisce un path.
const { spawnSync } = require("child_process");
const path = require("path");

const electronPath = require("electron");
const projectRoot = path.join(__dirname, "..");
const args = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electronPath, args.length ? args : ["."], {
  cwd: projectRoot,
  stdio: "inherit",
  env,
});

process.exit(result.status ?? (result.signal ? 1 : 0));
