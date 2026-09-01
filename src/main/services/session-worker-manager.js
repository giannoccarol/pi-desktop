"use strict";

// Manager del worker thread per la scansione sessioni. Espone le stesse
// firme sincrone di services/sessions come API async; se il worker non e'
// disponibile (spawn fallito, crash, timeout) cade sul modulo sincrono,
// cosi' il comportamento degradato resta quello di prima.

const { Worker } = require("worker_threads");
const path = require("path");
const syncSessions = require("./sessions");

const CALL_TIMEOUT_MS = 60_000;

let worker = null;
let starting = null;
let seq = 0;
const pending = new Map();

function failAll(err) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(err);
  }
  pending.clear();
}

function ensureWorker() {
  if (worker) return Promise.resolve(worker);
  if (!starting) {
    starting = new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(path.join(__dirname, "session-worker.js"));
      } catch (err) {
        starting = null;
        reject(err);
        return;
      }
      w.on("message", (msg) => {
        const entry = msg && pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) entry.reject(new Error(msg.error));
        else entry.resolve(msg.result);
      });
      w.on("error", (err) => {
        failAll(err);
        if (worker === w) { worker = null; starting = null; }
      });
      w.on("exit", () => {
        failAll(new Error("session worker terminato"));
        if (worker === w) { worker = null; starting = null; }
      });
      worker = w;
      resolve(w);
    });
  }
  return starting;
}

function call(method, ...args) {
  return ensureWorker().then((w) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout session worker: ${method}`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      w.postMessage({ id, method, args });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  }));
}

async function callWithFallback(method, ...args) {
  try {
    return await call(method, ...args);
  } catch (err) {
    console.warn(`[session-worker] fallback sync per ${method}:`, err && err.message ? err.message : err);
    return syncSessions[method](...args);
  }
}

module.exports = {
  listSessions: (...a) => callWithFallback("listSessions", ...a),
  parseSessionFile: (...a) => callWithFallback("parseSessionFile", ...a),
  readSessionMessages: (...a) => callWithFallback("readSessionMessages", ...a),
  readSessionMessagesSlice: (...a) => callWithFallback("readSessionMessagesSlice", ...a),
  countSessionMessages: (...a) => callWithFallback("countSessionMessages", ...a),
  searchSessionsFullText: (...a) => callWithFallback("searchSessionsFullText", ...a),
  deleteSession: (...a) => callWithFallback("deleteSession", ...a),
  bulkDeleteSessions: (...a) => callWithFallback("bulkDeleteSessions", ...a),
  listExplorerTree: (...a) => callWithFallback("listExplorerTree", ...a),
};
