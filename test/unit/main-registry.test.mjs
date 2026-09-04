import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(__dirname, "../../src/main/core/main.js");

// Regressione: una rinomina meccanica di ipcMain.handle() aveva reso handle()
// ricorsiva (Maximum call stack size exceeded all'avvio, nessun handler
// registrato). Questo test fallisce se la delega si rompe di nuovo.
test("main ipc registry: handle() delega a ipcMain.handle senza ricorsione", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  const body = src.match(/function handle\(channel, fn\) \{([\s\S]*?)\n\}/);
  assert.ok(body, "funzione handle(channel, fn) trovata in main.js");
  assert.match(body[1], /ipcMain\.handle\(channel, fn\)/, "handle() deve delegare a ipcMain.handle()");
  assert.doesNotMatch(body[1], /(?<!ipcMain\.)handle\(channel, fn\)/, "handle() non deve richiamare se stessa");
});

test("main ipc registry: esiste una sola registrazione diretta ipcMain.handle", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  const direct = src.match(/ipcMain\.handle\(/g) || [];
  assert.equal(direct.length, 1, "solo la delega dentro handle() può usare ipcMain.handle()");
  assert.match(src, /function callIpc\(channel, args/, "callIpc() esposto per il bridge web");
});
