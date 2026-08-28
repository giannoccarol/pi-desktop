"use strict";
// Smoke Electron robusto: rileva white-screen e Object has been destroyed.
// Usato da `npm run verify` e da CI (xvfb). Ritorna exit 1 se trova ReferenceError / Object destroyed / Uncaught Exception.
const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT || 15000);
const secondInstanceDelay = 4000;

function run() {
  return new Promise((resolve) => {
    let output = "";
    let failed = false;
    let done = false;
    const fail = (msg) => {
      if (done) return;
      done = true;
      console.error(msg);
      cleanup();
      resolve(1);
    };
    const pass = (msg) => {
      if (done) return;
      done = true;
      console.log(msg);
      cleanup();
      resolve(failed ? 1 : 0);
    };

    const isWayland = Boolean(process.env.WAYLAND_DISPLAY);
    const hasDisplay = Boolean(process.env.DISPLAY || isWayland);
    const xvfb = process.platform === "linux" && !hasDisplay ? "xvfb-run" : null;

    const electronArgs = ["scripts/run-electron.js", ".", "--enable-logging"];
    // GitHub-hosted Linux runners do not preserve Electron's SUID sandbox
    // permissions after npm ci. Keep the smoke test focused on app startup.
    if (process.platform === "linux" && process.env.CI) electronArgs.push("--no-sandbox");
    const args = xvfb ? ["-a", "node", ...electronArgs] : electronArgs;
    const cmd = xvfb ? "xvfb-run" : process.execPath;
    const env = { ...process.env, SMOKE_TIMEOUT: String(timeoutMs) };
    delete env.ELECTRON_RUN_AS_NODE;
    const proc = spawn(cmd, args, { cwd: root, env });

    const timer = setTimeout(() => {
      // Timeout: se abbiamo visto "agente avviato" e nessun errore critico, è ok
      const agentStarted = /agente avviato/i.test(output);
      const agentUnavailable = /PI_NOT_INSTALLED|pi non installato/i.test(output);
      const hasCriticalError = /ReferenceError|Object has been destroyed|Uncaught Exception|TypeError.*destroyed/i.test(output);
      if ((agentStarted || (process.env.CI && agentUnavailable)) && !hasCriticalError) {
        pass(agentStarted
          ? "smoke: ok - '[pi-desktop] agente avviato' e nessun ReferenceError/Object destroyed (timeout)"
          : "smoke: ok - app avviata senza agente pi e nessun ReferenceError/Object destroyed (timeout)");
      } else if (/ReferenceError|is not defined/i.test(output)) {
        fail(`smoke FAIL: ReferenceError rilevato:\n${output.slice(-3000)}`);
      } else if (/Object has been destroyed/i.test(output)) {
        fail(`smoke FAIL: Object has been destroyed rilevato:\n${output.slice(-3000)}`);
      } else if (/Uncaught Exception/i.test(output)) {
        fail(`smoke FAIL: Uncaught Exception rilevato:\n${output.slice(-3000)}`);
      } else if (!/agente avviato/i.test(output)) {
        console.log(output.slice(-2000));
        fail("smoke FAIL: marker '[pi-desktop] agente avviato' non rilevato entro il timeout");
      } else {
        pass("smoke: ok (timeout)");
      }
    }, timeoutMs);

    let secondProc = null;
    let secondTriggered = false;

    proc.stdout.on("data", (d) => { output += d.toString(); check(); });
    proc.stderr.on("data", (d) => { output += d.toString(); check(); });

    function check() {
      if (/Object has been destroyed/i.test(output)) {
        failed = true;
        clearTimeout(timer);
        fail(`smoke FAIL: Object has been destroyed rilevato:\n${output.slice(-3000)}`);
      } else if (/ReferenceError|is not defined/.test(output) && /openSessionTree|ReferenceError/.test(output)) {
        failed = true;
        clearTimeout(timer);
        fail(`smoke FAIL: ReferenceError rilevato:\n${output.slice(-3000)}`);
      } else if (/Uncaught Exception/i.test(output) && /TypeError.*destroyed/i.test(output)) {
        failed = true;
        clearTimeout(timer);
        fail(`smoke FAIL: Uncaught Exception (destroyed) rilevato:\n${output.slice(-3000)}`);
      }

      if (!secondTriggered && /agente avviato/i.test(output)) {
        secondTriggered = true;
        // Trigger second-instance per testare showWindow su window esistente (riproduce bug 155:11)
        setTimeout(() => {
          try {
            const sArgs = xvfb ? ["-a", "node", ...electronArgs] : electronArgs;
            const sCmd = xvfb ? "xvfb-run" : process.execPath;
            secondProc = spawn(sCmd, sArgs, { cwd: root, env });
            let secondOut = "";
            secondProc.stdout.on("data", (d) => { secondOut += d.toString(); output += d.toString(); });
            secondProc.stderr.on("data", (d) => { secondOut += d.toString(); output += d.toString(); });
            setTimeout(() => { try { secondProc.kill("SIGTERM"); } catch {} }, 3000);
          } catch {}
        }, secondInstanceDelay);
      }
    }

    function cleanup() {
      clearTimeout(timer);
      try { proc.kill("SIGTERM"); } catch {}
      try { secondProc && secondProc.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        try { secondProc && secondProc.kill("SIGKILL"); } catch {}
      }, 1500);
    }

    proc.on("error", (err) => {
      clearTimeout(timer);
      fail(`smoke FAIL: avvio Electron non riuscito: ${err.message}`);
    });
  });
}

run().then((code) => process.exit(code));
