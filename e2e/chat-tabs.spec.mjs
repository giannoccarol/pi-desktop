"use strict";
// Suite switch tra chat aperte (richiede l'agente pi).
// I tab multipli nell'app reale nascono APRENDO SESSIONI dalla sidebar
// (il click su "Nuova chat" riusa il tab vuoto corrente per design).
import { test, expect } from "@playwright/test";
import { launchApp, readManifest, piAvailable } from "./helpers/app.mjs";

test.describe("switch chat aperte", () => {
  test.skip(!piAvailable(), "agente pi non disponibile: aprire sessioni richiede il runtime");

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

  /**
   * Apre una sessione usando gli stessi entry-point di produzione del click
   * sull'item (IPC piDesktop.openSession + switchToTab della tab bar), ma
   * senza la corsa di switchGeneration dentro openHistorySession che il
   * warm-start in background puo' far scattare durante il setup.
   */
  async function openSession(projPath, basename_) {
    const file = `${projPath.replace("/projects/", "/sessions/")}/${basename_}`;
    await page.evaluate(async (f) => {
      window.piSidebar?.stashActiveTabContext?.(); // come fa openHistorySession all'ingresso
      const sess = window.piStore.state.sessions.find((x) => x.file === f);
      if (!sess) throw new Error("sessione non trovata: " + f);
      const res = await window.piDesktop.openSession(f, sess.cwd, sess.preference, sess.name || sess.preview);
      // Sincronizza i tab dal runtime (porta sessionFile nel renderer), poi attiva
      await window.refreshTabs();
      const s = window.piStore.state;
      if (s.activeTabId !== res.tabId) {
        await window.switchToTab(res.tabId); // percorso completo: render + restore contesto
      } else {
        // Il runtime ha gia' attivato il tab: riproduci il restore del flusso reale
        s.activeSessionFile = f;
        const gm = await window.piDesktop.getMessages(res.tabId);
        const msgs = (window.piChatUtils?.collapseRetryAttempts ?? ((m) => m))(gm?.messages || []);
        if (msgs.length) await window.piSessionView.renderConversation(msgs, () => true);
        document.querySelector("#input").value = "";
      }
    }, file);
    // Tab attivo con sessione caricata (loading terminato)
    await page.waitForFunction(
      (f) => {
        const s = window.piStore.state;
        return s.activeSessionFile === f && !s.tabs.find((t) => t.id === s.activeTabId)?.busy;
      },
      file,
      { timeout: 60_000 }
    );
    return file;
  }

  test("aprire due sessioni crea due tab separati e lo switch li alterna", async () => {
    const [a, b] = pickTwoSmallSessions();

    const fileA = await openSession(a.proj, a.file);
    const tabsA = await page.locator(".chat-tab").count();
    const fileB = await openSession(b.proj, b.file);
    await expect(page.locator(".chat-tab")).toHaveCount(tabsA + 1);

    // Switch alternato: l'activeSessionFile segue sempre il tab cliccato
    const tabB = page.locator(".chat-tab").last();
    const tabA = page.locator(".chat-tab").nth(tabsA - 1);
    for (let i = 0; i < 3; i++) {
      await tabA.click();
      await expect(page.locator(".chat-tab.active")).toHaveClass(/active/);
      expect(await page.evaluate(() => window.piStore.state.activeSessionFile)).toBe(fileA);
      await tabB.click();
      expect(await page.evaluate(() => window.piStore.state.activeSessionFile)).toBe(fileB);
    }
  });

  test("il contesto input e' per-tab: il marker resta al ritorno sul tab", async () => {
    const [a] = pickTwoSmallSessions(true);
    const [, b] = pickTwoSmallSessions(false);
    const fileA = await openSession(a.proj, a.file);
    const tabA = await page.evaluate((f) => window.piStore.state.tabs.find((t) => t.sessionFile === f)?.id, fileA);
    await page.locator("#input").fill("marker-tab-A");

    await openSession(b.proj, b.file);
    // Il restore del contesto avviene dopo il caricamento: aspetta che l'input cambi
    await expect
      .poll(() => page.locator("#input").inputValue(), { timeout: 10_000 })
      .not.toBe("marker-tab-A");
    const valueOther = await page.locator("#input").inputValue();

    // torna sul primo tab tramite la TAB BAR (stabile, non ricostruita dalla sidebar)
    await page.locator(`.chat-tab[data-tab-id="${tabA}"]`).click();
    await expect(page.locator(`.chat-tab.active[data-tab-id="${tabA}"]`)).toBeVisible();
    await expect
      .poll(() => page.locator("#input").inputValue(), { timeout: 10_000 })
      .toBe("marker-tab-A");
    expect(valueOther === "marker-tab-A").toBeFalsy();
  });

  test("'Nuova chat' su tab vuoto riusa il tab (dedup) senza crearne uno nuovo", async () => {
    // Assicura un tab vuoto attivo
    await page.evaluate(() => window.newChat());
    await page.waitForTimeout(800);
    const before = await page.locator(".chat-tab").count();
    await page.locator("#btn-new-chat").click();
    await page.waitForTimeout(800);
    expect(await page.locator(".chat-tab").count()).toBe(before);
  });

  // ---------- helpers ----------
  let used = new Set();
  function pickTwoSmallSessions(avoidRepeat = false) {
    if (!avoidRepeat) used = new Set();
    const out = [];
    for (const p of manifest.projects) {
      for (const s of p.sessions) {
        if (s.messages >= 12 && s.messages <= 60 && !used.has(s.file)) {
          out.push({ proj: p.path, file: s.file });
          used.add(s.file);
          if (out.length >= 2) return out;
        }
      }
    }
    throw new Error("fixture insufficienti");
  }
});
