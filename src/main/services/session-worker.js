"use strict";

// Worker thread per la scansione dei file di sessione. Le funzioni di
// sessions.js usano fs sincrono su migliaia di file (e rileggono interamente
// il JSONL attivo a ogni modifica durante lo streaming): eseguirle qui tiene
// l'event loop del main process libero, cosi' le IPC (delti di streaming
// inclusi) non si fermano durante i re-scan.

const { parentPort } = require("worker_threads");
const sessions = require("./sessions");

parentPort.on("message", (msg) => {
  const { id, method, args } = msg || {};
  Promise.resolve()
    .then(() => {
      const fn = sessions[method];
      if (typeof fn !== "function") throw new Error(`metodo sessione sconosciuto: ${method}`);
      return fn(...(Array.isArray(args) ? args : []));
    })
    .then(
      (result) => { try { parentPort.postMessage({ id, result }); } catch (err) { try { parentPort.postMessage({ id, error: err.message }); } catch {} } },
      (err) => { try { parentPort.postMessage({ id, error: err && err.message ? err.message : String(err) }); } catch {} }
    );
});
