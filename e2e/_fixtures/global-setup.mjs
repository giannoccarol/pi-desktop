"use strict";
// Global setup Playwright: garantisce che le fixture giganti esistano.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export default function globalSetup() {
  const root = path.resolve(import.meta.dirname, "..");
  const gen = path.join(root, "_fixtures", "generate.mjs");
  const manifest = path.join(root, ".artifacts", "fixtures", "manifest.json");
  if (!fs.existsSync(manifest)) {
    execFileSync(process.execPath, [gen], { cwd: path.resolve(root, ".."), stdio: "inherit" });
  } else {
    const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
    console.log(`[global-setup] fixture pronte: ${m.totalProjects} progetti, ${m.totalSessions} sessioni, ${m.totalMessages} messaggi`);
  }
}
