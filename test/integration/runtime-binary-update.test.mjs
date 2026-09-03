"use strict";
// Verifica del fix "catalogo modelli stantio dopo update di pi a app aperta":
// un finto binario pi viene riscritto su disco mentre il runtime RPC e' attivo.
// Il runtime deve accorgersene (piBinaryChanged), il restart deve servire il
// catalogo della nuova versione e isBusy() deve coprire le operazioni mutanti.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const { PiRuntime } = require("../../src/main/core/runtime.js");

// Finto `pi --mode rpc`: risponde al protocollo JSONL con un catalogo modelli
// incorporato nel file stesso, cosi' "update" = riscrittura del binario.
const fakePiSource = (modelId, setModelDelayMs) => `#!/usr/bin/env node
"use strict";
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
rl.on("line", (line) => {
  let cmd;
  try { cmd = JSON.parse(line); } catch { return; }
  const reply = (data) => out({ id: cmd.id, type: "response", command: cmd.type, success: true, data });
  switch (cmd.type) {
    case "get_state":
      reply({ model: { provider: "mock", id: ${JSON.stringify(modelId)} }, isStreaming: false, sessionFile: null });
      break;
    case "get_available_models":
      reply({ models: [{ provider: "mock", id: ${JSON.stringify(modelId)}, name: "Mock " + ${JSON.stringify(modelId)} }] });
      break;
    case "set_model":
      setTimeout(() => reply({ ok: true }), ${Number(setModelDelayMs) || 0});
      break;
    default:
      reply({});
  }
});
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("runtime: update del binario pi a caldo -> piBinaryChanged, restart e catalogo fresco", { skip: process.platform === "win32" }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-hot-update-"));
  const fakePi = path.join(tmp, "pi");
  const writeFakePi = (modelId, delayMs) => fs.writeFileSync(fakePi, fakePiSource(modelId, delayMs), { mode: 0o755 });

  const runtime = new PiRuntime(() => {});
  try {
    // v1: il processo avviato con questa versione serve "old-model".
    writeFakePi("old-model", 0);
    await runtime.ensureStarted({ cwd: tmp, persist: false, piPath: fakePi });
    const before = await runtime.getAvailableModels();
    assert.equal(before.models[0].id, "old-model");
    assert.equal(await runtime.piBinaryChanged(), false, "nessun cambio subito dopo l'avvio");

    // mtime forzato oltre la granularita' del filesystem.
    writeFakePi("new-model", 0);
    fs.utimesSync(fakePi, new Date(), new Date(Date.now() + 10_000));
    assert.equal(await runtime.piBinaryChanged(), true, "il binario riscritto viene rilevato");

    // Il processo vecchio risponde ancora con il vecchio catalogo...
    const stale = await runtime.getAvailableModels();
    assert.equal(stale.models[0].id, "old-model", "il processo in vita mantiene la sua versione");

    // ...il restart serve il catalogo della nuova installazione.
    await runtime.restart();
    const after = await runtime.getAvailableModels();
    assert.equal(after.models[0].id, "new-model");
    assert.equal(await runtime.piBinaryChanged(), false, "dopo il restart il tracciato e' riallineato");
  } finally {
    await runtime.stop().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("runtime: isBusy copre la finestra delle operazioni mutanti, non le readOnly", { skip: process.platform === "win32" }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-busy-"));
  const fakePi = path.join(tmp, "pi");
  fs.writeFileSync(fakePi, fakePiSource("busy-model", 300), { mode: 0o755 });

  const runtime = new PiRuntime(() => {});
  try {
    await runtime.ensureStarted({ cwd: tmp, persist: false, piPath: fakePi });
    assert.equal(runtime.isBusy(), false, "idle dopo l'avvio");

    // readonly: non influenza il busy (il main usa isBusy per decidere se restartare).
    await runtime.getAvailableModels();
    assert.equal(runtime.isBusy(), false, "getAvailableModels non e' mutante");

    // mutante lenta (set_model risponde dopo 300ms): la finestra deve essere visibile.
    const slow = runtime.setModel("mock", "busy-model");
    await sleep(80);
    assert.equal(runtime.isBusy(), true, "operazione mutante in volo");
    await slow;
    assert.equal(runtime.isBusy(), false, "idle dopo il completamento");
  } finally {
    await runtime.stop().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
