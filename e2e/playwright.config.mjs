"use strict";
// Configurazione Playwright per i test e2e di Pi Desktop (Electron).
// Documentazione: docs/e2e-testing.md
//
// Nota: non serve `npx playwright install` — usiamo solo _electron.launch(),
// nessun browser Chromium viene scaricato o avviato.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: ".artifacts/results",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  globalSetup: "./_fixtures/global-setup.mjs",
  reporter: [["list"], ["json", { outputFile: ".artifacts/report.json" }]],
  use: {
    trace: "off",
  },
});
