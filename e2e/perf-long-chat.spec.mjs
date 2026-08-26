"use strict";
// Misurazione velocita' su chat lunghissime (@perf).
// Apre la sessione mostro da 6000 messaggi:
//  - misura il tempo apertura -> conversazione renderizzata e stabile
//     (il runtime espone una finestra di contesto, non necessariamente tutti
//      i 6000 nodi: misuriamo la realta', registrando anche quanti messaggi
//      finiscono effettivamente nel DOM)
//  - misura i long task durante scroll estremo top/bottom (PerformanceObserver)
import { test, expect } from "@playwright/test";
import { launchApp, piAvailable, readManifest, saveMetrics } from "./helpers/app.mjs";

const BUDGET_OPEN_MS = 150_000; // il resume di 6000 messaggi nell'agente e' dominato dal runtime pi
const BUDGET_SCROLL_WORST_TASK_MS = 500;
const BUDGET_SCROLL_LONGTASKS = 40;

test.describe("perf: chat lunghissime", () => {
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
    await ctx?.close?.();
  });

  test("apertura della sessione mostro entro il budget", async () => {
    test.setTimeout(240_000);
    const monster = manifest.projects.flatMap((p) => p.sessions).sort((a, b) => b.messages - a.messages)[0];
    const proj = manifest.projects.find((p) => p.sessions.includes(monster));
    const file = `${proj.path.replace("/projects/", "/sessions/")}/${monster.file}`;
    test.expect(monster.messages).toBeGreaterThanOrEqual(6000);

    // Observer dei long task PRIMA dell'apertura (buffered: include anche il render)
    await page.evaluate(() => {
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks.push(Math.round(entry.duration));
      }).observe({ type: "longtask", buffered: true });
    });

    // Stessi entry-point di produzione del click: IPC openSession + switchToTab
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
    // Fase 1: sessione aperta nel runtime (attiva, non occupata)
    await page.waitForFunction(
      (f) => {
        const s = window.piStore.state;
        return s.activeSessionFile === f && !s.tabs.find((t) => t.id === s.activeTabId)?.busy;
      },
      file,
      { timeout: BUDGET_OPEN_MS }
    );
    // Fase 2: conversazione dipinta nel DOM
    await page.waitForFunction(
      () => document.querySelectorAll("#messages > *").length > 20,
      null,
      { timeout: 120_000 }
    );
    // doppio rAF: rendering effettivamente dipinto
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const openMs = Date.now() - t0;

    const rendered = await page.evaluate(() => document.querySelector("#messages").children.length);
    const tasksDuringOpen = await page.evaluate(() => (window.__longTasks || []).slice());

    console.log(`[perf] apertura chat ${monster.messages} msg (fixture): ${openMs}ms, nodi DOM=${rendered}, long task=${tasksDuringOpen.length}`);
    saveMetrics("long-chat-open", {
      fixtureMessages: monster.messages,
      domNodesRendered: rendered,
      openMs,
      budgetMs: BUDGET_OPEN_MS,
      longTasksDuringOpenMs: tasksDuringOpen,
    });
    expect(openMs, `apertura ${openMs}ms < ${BUDGET_OPEN_MS}ms`).toBeLessThan(BUDGET_OPEN_MS);
    expect(rendered).toBeGreaterThan(20);
  });

  test("scroll estremo sulla chat lunga senza jank fuori budget", async () => {
    const msgCount = await page.locator("#messages > *").count();
    test.expect(msgCount).toBeGreaterThan(20);

    // Solo i task durante lo scroll: resetta l'observer
    await page.evaluate(() => { window.__longTasks = []; });

    for (let i = 0; i < 6; i++) {
      await page.evaluate((toBottom) => {
        const scroller = [...document.querySelectorAll("*")].find(
          (el) => el.scrollHeight > el.clientHeight + 100 && getComputedStyle(el).overflowY !== "visible"
        );
        const target = toBottom ? 999_999_999 : 0;
        scroller?.scrollTo?.(0, target);
        document.scrollingElement?.scrollTo?.(0, target);
        document.querySelector("#chat")?.scrollTo?.(0, target);
      }, i % 2 === 0);
      await page.waitForTimeout(300);
    }

    const tasks = await page.evaluate(() => window.__longTasks || []);
    const worst = tasks.length ? Math.max(...tasks) : 0;
    console.log(`[perf] scroll: ${tasks.length} long task (>50ms), worst=${worst}ms`);
    saveMetrics("long-chat-scroll", {
      longTasksCount: tasks.length,
      worstTaskMs: worst,
      tasksMs: tasks.slice(-50),
      budgets: { worstTaskMs: BUDGET_SCROLL_WORST_TASK_MS, longTasks: BUDGET_SCROLL_LONGTASKS },
    });

    expect(worst, `worst long task ${worst}ms <= ${BUDGET_SCROLL_WORST_TASK_MS}ms`).toBeLessThanOrEqual(BUDGET_SCROLL_WORST_TASK_MS);
    expect(tasks.length, `long task durante scroll: ${tasks.length} <= ${BUDGET_SCROLL_LONGTASKS}`).toBeLessThanOrEqual(BUDGET_SCROLL_LONGTASKS);
  });
});
