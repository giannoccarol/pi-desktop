"use strict";
// Global setup Playwright: garantisce che le fixture giganti esistano.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export default function globalSetup() {
  const root = path.resolve(import.meta.dirname, "..");
  const gen = path.join(root, "_fixtures", "generate.mjs");
  const fixtures = path.join(root, ".artifacts", "fixtures");
  const manifest = path.join(fixtures, "manifest.json");
  // Le fixture sono condivise tra i run: se un test cancella una sessione il
  // manifest resta indietro e gli spec che aspettano totalSessions vanno in
  // timeout. Valida il conteggio reale su disco, non solo l'esistenza.
  const healthy = (() => {
    if (!fs.existsSync(manifest)) return false;
    try {
      const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
      const onDisk = fs.readdirSync(path.join(fixtures, "sessions"), { recursive: true })
        .filter((f) => String(f).endsWith(".jsonl")).length;
      return onDisk === Number(m.totalSessions);
    } catch {
      return false;
    }
  })();
  if (!healthy) {
    fs.rmSync(fixtures, { recursive: true, force: true });
    execFileSync(process.execPath, [gen], { cwd: path.resolve(root, ".."), stdio: "inherit" });
  } else {
    const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
    console.log(`[global-setup] fixture pronte: ${m.totalProjects} progetti, ${m.totalSessions} sessioni, ${m.totalMessages} messaggi`);
  }
}
