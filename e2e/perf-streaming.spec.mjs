"use strict";
// Misurazione long task durante lo streaming di markdown (@perf).
//
// Simula nel renderer una risposta in streaming (delta testuali su testo
// markdown con paragrafi e fenced code) direttamente sul percorso di
// produzione (streamApplyDelta -> coda di rendering throttled):
//  - verifica che il render incrementale non produca long task oltre budget
//  - registra e2e/.artifacts/metrics/streaming-long-tasks.json
import { test, expect } from "@playwright/test";
import { launchApp, saveMetrics } from "./helpers/app.mjs";

const BUDGET_WORST_TASK_MS = 120;
const BUDGET_LONGTASKS = 5;
const DELTA_COUNT = 90;
const DELTA_PAUSE_MS = 8;

test.describe("perf: streaming markdown", () => {
  test("i delta di streaming non generano long task oltre budget", async () => {
    test.setTimeout(120_000);
    const ctx = await launchApp();
    const page = ctx.page;
    await page.waitForFunction(
      () => Boolean(window.piChat?.beginStreamAssistant && window.piChat?.streamApplyDelta && window.piStore?.state),
      null,
      { timeout: 30_000 }
    );

    const result = await page.evaluate(async ({ deltaCount, pauseMs }) => {
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks.push(Math.round(entry.duration));
      }).observe({ type: "longtask" });

      const paragraph = "Paragrafo di streaming con **grassetto**, `codice inline` e [link](https://esempio.it) per il render.\n\n";
      const fence = "```js\nfunction esempio(){ return 42; }\n```\n\n";
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      window.piChat.beginStreamAssistant();
      for (let i = 0; i < deltaCount; i++) {
          window.piChat.streamApplyDelta({
            assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: (i % 4 === 3 ? fence : paragraph).repeat(3) },
          });
          await sleep(pauseMs);
        }
        const finalText = paragraph.repeat(deltaCount);
        window.piChat.streamApplyDelta({ assistantMessageEvent: { type: "text_end", contentIndex: 0, content: finalText } });
        window.piChat.endStreamAssistant({ content: [{ type: "text", text: finalText }], stopReason: "end_turn" });
        await sleep(300);
        const renderedBlocks = document.querySelectorAll("#messages .md, #messages .codeblock").length;
        window.piChat.clearChat();
        return { longTasks: window.__longTasks, renderedBlocks };
    }, { deltaCount: DELTA_COUNT, pauseMs: DELTA_PAUSE_MS });

    const worst = result.longTasks.length ? Math.max(...result.longTasks) : 0;
    saveMetrics("streaming-long-tasks", {
      deltaCount: DELTA_COUNT,
      longTasksCount: result.longTasks.length,
      worstTaskMs: worst,
      longTasksMs: result.longTasks,
      budgets: { worstTaskMs: BUDGET_WORST_TASK_MS, longTasks: BUDGET_LONGTASKS },
    });
    expect(result.renderedBlocks).toBeGreaterThan(0);
    expect(result.longTasks.length).toBeLessThanOrEqual(BUDGET_LONGTASKS);
    expect(worst).toBeLessThanOrEqual(BUDGET_WORST_TASK_MS);
    await ctx.close();
  });
});
