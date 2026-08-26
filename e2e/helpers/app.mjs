"use strict";
// Helper di lancio dell'app Electron sotto Playwright con stato completamente isolato.
//
// Isolamento garantito da:
//  - PI_DESKTOP_USER_DATA -> userData dedicata (vedi src/main/core/main.js)
//  - settings.json della fixture -> sessionsDir puntato sulle fixture giganti
//  - env pulito senza ELECTRON_RUN_AS_NODE (impostato da IDE tipo Cursor)

import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

export const FIXTURES_ROOT = path.resolve("e2e/.artifacts/fixtures");
export const ARTIFACTS_ROOT = path.resolve("e2e/.artifacts");

/** true se il binario `pi` è disponibile (serve per tab/chat reali). */
export function piAvailable() {
  try {
    execFileSync("pi", ["--version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_ROOT, "manifest.json"), "utf8"));
}

/**
 * Salva metriche di performance come artefatto JSON e le stampa in console.
 */
export function saveMetrics(name, data) {
  const dir = path.join(ARTIFACTS_ROOT, "metrics");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ name, date: new Date().toISOString(), ...data }, null, 2));
  console.log(`[metrics] ${name} -> ${file}`);
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return null;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return Math.round(sortedArr[idx]);
}

/** Statistiche riassuntive da un array di durate in ms. */
export function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    n: durations.length,
    min: percentile(sorted, 0),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: percentile(sorted, 100),
    mean: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
  };
}

export function printStats(label, s) {
  console.log(`[perf] ${label}: n=${s.n} min=${s.min}ms p50=${s.p50}ms p90=${s.p90}ms p95=${s.p95}ms max=${s.max}ms media=${s.mean}ms`);
}

/**
 * Lancia l'app e restituisce { app, page } con la prima finestra pronta al boot.
 */
export async function launchApp(testInfo) {
  const userData = path.join(FIXTURES_ROOT, "userdata");
  // Ogni run ha la sua userData copia per evitare lock/incrostazioni tra worker.
  const isolatedUserData = path.join(os.tmpdir(), `pi-desktop-e2e-${process.pid}-${Date.now()}`);
  fs.cpSync(userData, isolatedUserData, { recursive: true });
  // Normalizza il cwd al primo progetto delle fixture: rende il boot deterministico
  // anche se run/probe precedenti hanno salvato impostazioni con un altro cwd.
  try {
    const settingsPath = path.join(isolatedUserData, "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (Array.isArray(settings.projects) && settings.projects.length) {
      settings.cwd = settings.projects[0];
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }
  } catch {}

  const env = { ...process.env, PI_DESKTOP_USER_DATA: isolatedUserData };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: ["."],
    cwd: path.resolve("."),
    env,
    timeout: 60_000,
  });

  const consoleErrors = [];
  const page = await app.firstWindow();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  // Boot completato: sidebar popolata dalle fixture.
  await page.waitForSelector("#projects-list .project-block", { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("#projects-list .project-block").length > 0, null, { timeout: 30_000 });

  return {
    app,
    page,
    consoleErrors,
    close: async () => {
      try { await app.close(); } catch {}
      try { fs.rmSync(isolatedUserData, { recursive: true, force: true }); } catch {}
    },
  };
}
