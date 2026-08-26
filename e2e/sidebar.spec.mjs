"use strict";
// Suite sidebar (ermetica: non richiede l'agente pi).
// Copre il rendering della sidebar con il mockup gigante di progetti/sessioni,
// ricerca, paginazione "mostra tutte" e performance di refresh della lista.
//
// Semantica reale dell'app documentata dai test:
//  - il progetto attivo (cwd) parte espanso con max 6 sessioni visibili
//  - senza ricerca ogni progetto espanso mostra max N sessioni (projectLimits)
//  - "#sessions-count" = sessioni totali caricate + tab draft aperti
import { test, expect } from "@playwright/test";
import { launchApp, readManifest, saveMetrics } from "./helpers/app.mjs";

const DEFAULT_LIMIT = 6;

test.describe("sidebar con mockup gigante", () => {
  let ctx;
  let manifest;
  let page;

  test.beforeAll(async () => {
    manifest = readManifest();
    ctx = await launchApp();
    page = ctx.page;
    // Le sessioni vengono caricate async dopo il boot: aspetta il dataset completo.
    await page.waitForFunction(
      (total) => (window.piStore?.state?.sessions?.length ?? 0) >= total,
      manifest.totalSessions,
      { timeout: 30_000 }
    );
  });

  test.afterAll(async () => {
    await ctx?.close?.();
  });

  test("renderizza tutti i progetti delle fixture", async () => {
    await expect(page.locator("#projects-list .project-block")).toHaveCount(manifest.totalProjects);
  });

  test("il dataset completo arriva al renderer tramite IPC reale", async () => {
    const n = await page.evaluate(async () => (await window.piDesktop.listSessions()).length);
    expect(n).toBe(manifest.totalSessions);
  });

  test("il conteggio '#sessions-count' riflette sessioni caricate + tab draft", async () => {
    const expectedText = await page.evaluate(() => {
      const s = window.piStore.state;
      return `${s.sessions.length + s.tabs.filter((t) => !t.sessionFile).length} chat`;
    });
    await expect(page.locator("#sessions-count")).toHaveText(expectedText);
    // e le sessioni caricate sono esattamente quelle delle fixture
    const sessions = await page.evaluate(() => window.piStore.state.sessions.length);
    expect(sessions).toBe(manifest.totalSessions);
  });

  test("il progetto attivo parte espanso con limite iniziale di sessioni", async () => {
    // Il progetto attivo lo decide l'app (state.settings.cwd), non il manifest
    const activePath = await page.evaluate(() => window.piStore.state.settings.cwd);
    const proj = manifest.projects.find((p) => p.path === activePath) ?? manifest.projects[0];
    const block = page.locator(`.project-block[data-path="${activePath}"]`);
    await expect(block).toHaveClass(/expanded/);
    const items = block.locator(".session-item");
    const shown = Math.min(DEFAULT_LIMIT, proj.sessionsCount);
    await expect(items).toHaveCount(shown);
  });

  test("espandere un progetto rispetta il limite, 'mostra tutte' le sblocca", async () => {
    const activePath = await page.evaluate(() => window.piStore.state.settings.cwd);
    const proj = manifest.projects.find((p) => p.path !== activePath && p.sessionsCount > DEFAULT_LIMIT);
    test.expect(proj).toBeTruthy();
    const block = page.locator(`.project-block[data-path="${proj.path}"]`);

    // Se per qualche motivo fosse gia' espanso, collassalo prima (toggle).
    // Il toggle puo' perdere il click se la sidebar si ricostruisce nel frattempo
    // (refresh ogni 10s): ritenta fino a 3 volte verificando lo stato effettivo.
    for (let attempt = 0; attempt < 3; attempt++) {
      const isExpanded = (await block.getAttribute("class"))?.includes("expanded");
      await block.locator(".project-row").click();
      try {
        if (isExpanded) await expect(block).not.toHaveClass(/expanded/, { timeout: 3000 });
        else await expect(block).toHaveClass(/expanded/, { timeout: 3000 });
        break;
      } catch {
        if (attempt === 2) throw new Error("toggle espansione non riuscito dopo 3 tentativi");
      }
    }
    await expect(block).toHaveClass(/expanded/);

    // Limite iniziale: solo DEFAULT_LIMIT session-item renderizzati
    await expect(block.locator(".session-item")).toHaveCount(Math.min(DEFAULT_LIMIT, proj.sessionsCount));

    // Paginazione reale: ogni click su "Mostra altre N" aggiunge 6 finché non copre tutto
    for (let guard = 0; guard < 20; guard++) {
      const shownNow = await block.locator(".session-item").count();
      if (shownNow >= proj.sessionsCount) break;
      const moreBtn = block.locator(".project-more:not(.project-less)").first();
      if ((await moreBtn.count()) === 0) break;
      await moreBtn.click();
      await page.waitForTimeout(150);
    }
    await expect(block.locator(".session-item")).toHaveCount(proj.sessionsCount);

    // E "Mostra meno" ripristina
    await block.locator(".project-less").first().click();
    await expect(block.locator(".session-item")).toHaveCount(Math.min(DEFAULT_LIMIT, proj.sessionsCount));
  });

  test("la ricerca filtra progetti+sessioni ed espande tutto", async () => {
    await page.locator("#session-search").fill("debug marathon");
    const matches = page.locator(".session-item").filter({ hasText: /debug marathon/i });
    await expect(matches).toHaveCount(1);
    await expect(matches.first()).toBeVisible();

    await page.locator("#session-search").fill("");
    await expect(page.locator("#projects-list .project-block")).toHaveCount(manifest.totalProjects);
  });

  test("@perf refresh della lista sotto 2s con centinaia di sessioni", async () => {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const ms = await page.evaluate(async () => {
        const t0 = performance.now();
        await window.refreshSessions();
        return performance.now() - t0;
      });
      runs.push(Math.round(ms));
    }
    const sorted = [...runs].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
    saveMetrics("sidebar-refresh", { runsMs: runs, p95, budgetP95Ms: 2000 });
    console.log(`[perf] sidebar.refreshSessions x5: ${runs.join(", ")} ms (p95=${p95}ms)`);
    expect(p95, `p95 refresh lista ${p95}ms < 2000ms`).toBeLessThan(2000);
  });

  test("nessun errore console critico durante il boot con fixture giganti", async () => {
    const critical = (ctx.consoleErrors || []).filter((e) => /ReferenceError|is not defined|Cannot read propert/.test(e));
    expect(critical, critical.join("\n")).toEqual([]);
  });
});
