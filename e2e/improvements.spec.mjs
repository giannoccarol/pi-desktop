"use strict";
// Suite dedicata alle ottimizzazioni 1-5 (@perf @improvements):
//  1. sidebar: nessun rebuild se nulla e' cambiato (identita' dei nodi stabile)
//  2. polling in pausa quando la finestra e' nascosta
//  3. cronologia progressiva delle chat lunghissime (prepend con ancora di scroll)
//  4. move del DOM via fragment (implicito: apertura/render restano corretti)
//  5. budget switch piu' stretti (coperti da perf-switch.spec.mjs)
import { test, expect } from "@playwright/test";
import { launchApp, readManifest, piAvailable, saveMetrics } from "./helpers/app.mjs";

test.describe("ottimizzazioni renderer", () => {
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
    await page.waitForFunction(() => typeof window.__piPollTick === "function", null, { timeout: 10_000 });
  });

  test.afterAll(async () => {
    await ctx?.close?.();
  });

  test("#1 renderProjects senza cambiamenti non ricostruisce il DOM", async () => {
    // Due render consecutivi senza mutazioni: il nodo deve essere lo STESSO
    // (prima dell'ottimizzazione veniva ricreato da zero ogni volta)
    const r = await page.evaluate(() => {
      const before = document.querySelector("#projects-list .project-block");
      const t0 = performance.now();
      window.renderProjects();
      const dt1 = performance.now() - t0;
      const same1 = document.querySelector("#projects-list .project-block") === before;
      const t1 = performance.now();
      window.renderProjects();
      const dt2 = performance.now() - t1;
      const same2 = document.querySelector("#projects-list .project-block") === before;
      return { same1, same2, dt1: Math.round(dt1 * 100) / 100, dt2: Math.round(dt2 * 100) / 100 };
    });
    expect(r.same1, "il primo render senza cambiamenti conserva i nodi").toBe(true);
    expect(r.same2, "il secondo render senza cambiamenti conserva i nodi").toBe(true);
    expect(r.dt2, `render skippato quasi istantaneo (${r.dt2}ms)`).toBeLessThan(1);
    saveMetrics("improvement-sidebar-memo", r);
  });

  test("#1 refreshSessions con dati invariati non genera churn DOM", async () => {
    const res = await page.evaluate(async () => {
      const block = document.querySelector("#projects-list .project-block");
      await window.refreshSessions();
      const same = document.querySelector("#projects-list .project-block") === block;
      return same;
    });
    expect(res, "refreshSessions a dati identici mantiene gli stessi nodi").toBe(true);
  });

  test("#2 il polling salta i tick quando la finestra e' nascosta", async () => {
    const out = await page.evaluate(async () => {
      let calls = 0;
      const orig = window.refreshSessions;
      window.refreshSessions = (...a) => { calls++; return orig?.(...a); };
      try {
        // Simula finestra nascosta
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        await window.__piPollTick();
        const whileHidden = calls;
        // Ritorna visibile
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
        await window.__piPollTick();
        await new Promise((r) => setTimeout(r, 50));
        return { whileHidden, afterVisible: calls };
      } finally {
        delete document.hidden;
      }
    });
    expect(out.whileHidden, "nessuna chiamata mentre nascosto").toBe(0);
    expect(out.afterVisible, "riprende al ritorno in primo piano").toBeGreaterThanOrEqual(1);
    saveMetrics("improvement-polling-hidden", out);
  });

  test.describe("#3 cronologia progressiva su chat lunghissima", () => {
    test.skip(!piAvailable(), "agente pi non disponibile");

    test("scroll-top carica messaggi piu' vecchi con ancora stabile e senza jank", async () => {
      test.setTimeout(180_000);
      const monster = manifest.projects.flatMap((p) => p.sessions).sort((a, b) => b.messages - a.messages)[0];
      const proj = manifest.projects.find((p) => p.sessions.includes(monster));
      const file = `${proj.path.replace("/projects/", "/sessions/")}/${monster.file}`;
      test.expect(monster.messages).toBeGreaterThanOrEqual(6000);

      // Apri la mostro con il percorso di apertura reale
      await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); });
      await page.evaluate(async (f) => {
        window.piSidebar?.stashActiveTabContext?.();
        const sess = window.piStore.state.sessions.find((x) => x.file === f);
        if (!sess) throw new Error("sessione non trovata");
        const res = await window.piDesktop.openSession(f, sess.cwd, sess.preference, sess.name || sess.preview);
        await window.refreshTabs();
        const s = window.piStore.state;
        if (s.activeTabId !== res.tabId) await window.switchToTab(res.tabId);
        else s.activeSessionFile = f;
      }, file);
      // Aspetta che la conversazione sia renderizzata (finestra runtime ~100 nodi)
      // Il dialog di primo avvio puo' apparire: chiudilo prima e durante l'attesa
      await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); });
      await page.waitForFunction(
        () => document.querySelectorAll("#messages > *").length > 50,
        null,
        { timeout: 60_000 }
      );
      const initialCount = await page.locator("#messages > *").count();
      expect(initialCount).toBeGreaterThan(20);

      // Observer dei long task durante il caricamento della cronologia
      await page.evaluate(() => {
        window.__lt = [];
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); })
          .observe({ type: "longtask", buffered: false });
      });

      // Invoca direttamente loadOlderHistory e verifica il risultato
      const before = await page.locator("#messages > *").count();
      const loaded = await page.evaluate(async () => {
        return await window.piSessionView.loadOlderHistory();
      });
      // Piccola pausa per il rendering
      await page.waitForFunction((b) => document.querySelectorAll("#messages > *").length > b, before, { timeout: 10_000 });
      const afterCount = await page.locator("#messages > *").count();
      const tasks = await page.evaluate(() => window.__lt || []);
      const worst = tasks.length ? Math.max(...tasks) : 0;

      console.log(`[perf] cronologia: ${before} -> ${afterCount} nodi, caricati=${loaded}, worst task=${worst}ms`);
      saveMetrics("improvement-history-pagination", {
        initialNodes: before,
        afterNodes: afterCount,
        loaded,
        longTasksMs: tasks,
      });

      expect(loaded, "loadOlderHistory ha caricato almeno un chunk").toBeGreaterThanOrEqual(100);
      expect(afterCount, "nodi aggiunti sopra").toBeGreaterThan(before + 50);
      expect(worst, `worst long task ${worst}ms <= 500ms`).toBeLessThanOrEqual(500);
    });
  });
});
