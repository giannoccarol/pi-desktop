"use strict";
// Misurazione velocita' di switch tra chat caricate (@perf).
// Apre 6 sessioni reali (runtime pi) e misura l'alternanza tra i loro tab:
// e' lo scenario utente vero di "passo da una chat all'altra".
// Produce e2e/.artifacts/metrics/switch-latency.json con la distribuzione completa.
import { test, expect } from "@playwright/test";
import { launchApp, readManifest, piAvailable, saveMetrics, printStats, stats } from "./helpers/app.mjs";

// Budget di regressione: molto sopra la media osservata ma abbastanza stretti
// da bloccare un deterioramento netto dell'esperienza di switch.
const BUDGET_P50_MS = 600;
const BUDGET_P95_MS = 2000;

test.describe("perf: switch tra chat", () => {
  test.skip(!piAvailable(), "agente pi non disponibile");

  let ctx;
  let page;
  let manifest;

  test.beforeAll(async () => {
    manifest = readManifest();
    ctx = await launchApp();
    page = ctx.page;
    await page.waitForFunction(
      (total) => (window.piStore?.state?.sessions?.length ?? 0) >= total,
      manifest.totalSessions,
      { timeout: 30_000 }
    );
  });

  test.afterAll(async () => {
    if (ctx) {
      saveMetrics("switch-console-errors", { errors: ctx.consoleErrors });
      await ctx.close();
    }
  });

  async function openSessionByFile(projPath, basename_) {
    const file = `${projPath.replace("/projects/", "/sessions/")}/${basename_}`;
    const t0 = Date.now();
    await page.evaluate(async (f) => {
      window.piSidebar?.stashActiveTabContext?.(); // come fa openHistorySession all ingresso
      const sess = window.piStore.state.sessions.find((x) => x.file === f);
      if (!sess) throw new Error("sessione non trovata: " + f);
      const res = await window.piDesktop.openSession(f, sess.cwd, sess.preference, sess.name || sess.preview);
      await window.refreshTabs();
      const s = window.piStore.state;
      if (s.activeTabId !== res.tabId) {
        await window.switchToTab(res.tabId); // percorso completo: render + restore contesto
      } else {
        // Il runtime ha gia attivato il tab: riproduci il restore del flusso reale
        s.activeSessionFile = f;
        const gm = await window.piDesktop.getMessages(res.tabId);
        const msgs = (window.piChatUtils?.collapseRetryAttempts ?? ((m) => m))(gm?.messages || []);
        if (msgs.length) await window.piSessionView.renderConversation(msgs, () => true);
        document.querySelector("#input").value = "";
      }
    }, file);
    await page.waitForFunction(
      (f) => {
        const s = window.piStore.state;
        return s.activeSessionFile === f && !s.tabs.find((t) => t.id === s.activeTabId)?.busy;
      },
      file,
      { timeout: 90_000 }
    );
    console.log(`[setup] aperta ${basename_} in ${Date.now() - t0}ms`);
    return file;
  }

  test("switch ripetuti tra 6 chat caricate rispettano i budget di latenza", async () => {
    // Setup: apri 6 sessioni piccole (progetti diversi quando possibile)
    const targets = [];
    for (const p of manifest.projects) {
      for (const s of p.sessions) {
        if (s.messages >= 12 && s.messages <= 60) {
          targets.push({ proj: p.path, file: s.file });
          break;
        }
      }
      if (targets.length >= 6) break;
    }
    test.expect(targets.length).toBeGreaterThanOrEqual(6);

    const files = [];
    for (const t of targets) files.push(await openSessionByFile(t.proj, t.file));

    const tabIds = [];
    for (let i = 0; i < files.length; i++) {
      tabIds.push(await page.evaluate((f) => {
        const s = window.piStore.state;
        return s.tabs.find((t) => t.sessionFile === f)?.id ?? null;
      }, files[i]));
    }

    // Misura: alternanza avanti-indietro tra tab adiacenti
    const durations = [];
    const ITERATIONS = 36;
    for (let i = 0; i < ITERATIONS; i++) {
      const idx = i % 2 === 0 ? Math.floor(i / 2) % 6 : 5 - Math.floor(i / 2) % 6;
      const id = tabIds[idx];
      const t0 = Date.now();
      await page.locator(`.chat-tab[data-tab-id="${id}"]`).click();
      await page.waitForSelector(`.chat-tab.active[data-tab-id="${id}"]`, { timeout: 10_000 });
      // attende che il rendering della conversazione sia effettivamente stabile
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      durations.push(Date.now() - t0);
    }

    const s = stats(durations);
    printStats("switch chat caricate", s);
    saveMetrics("switch-latency", { ...s, durationsMs: durations, tabs: files.length, budgets: { p50: BUDGET_P50_MS, p95: BUDGET_P95_MS } });

    expect(s.p50, `p50 switch ${s.p50}ms < ${BUDGET_P50_MS}ms`).toBeLessThan(BUDGET_P50_MS);
    expect(s.p95, `p95 switch ${s.p95}ms < ${BUDGET_P95_MS}ms`).toBeLessThan(BUDGET_P95_MS);
  });

  test("nessun errore critico durante apertura e switch", async () => {
    const critical = (ctx.consoleErrors || []).filter((e) => /ReferenceError|is not defined|Cannot read propert/.test(e));
    expect(critical, critical.join("\n")).toEqual([]);
  });
});
