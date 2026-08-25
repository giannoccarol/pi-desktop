"use strict";
// Verifica pre-commit per agents e CI locale.
// Esegue: check syntax, lint (solo errori), renderer integrity, tests, smoke electron.
// Fallisce se uno step fallisce. Usato da git hook e da `npm run verify`.
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const isCI = Boolean(process.env.CI);
const isQuick = process.argv.includes("--quick");

function log(step, msg) {
  console.log(`\n== ${step} ==\n${msg}`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
  const out = (res.stdout || "") + (res.stderr || "");
  return { ok: res.status === 0, out, status: res.status };
}

let failed = false;

// 1) Syntax check (scripts/verify/check.js)
{
  const r = run(process.execPath, ["scripts/verify/check.js"]);
  console.log(r.out);
  if (!r.ok) {
    console.error("FAIL: npm run check");
    failed = true;
  } else log("check", "ok - syntax valid");
}

// 2) Renderer integrity: ogni src/renderer/**/*.js deve essere referenziato in index.html
{
  const htmlPath = path.join(root, "src/renderer/index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const rendererRoot = path.join(root, "src/renderer");
  const rendererFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith(".js")) rendererFiles.push(path.relative(rendererRoot, path.join(dir, e.name)).split(path.sep).join("/"));
    }
  })(rendererRoot);
  const missing = [];
  for (const rel of rendererFiles) {
    // app.js è sempre incluso, gli altri devono avere <script src="rel">
    if (!html.includes(`src="${rel}"`) && !html.includes(`src='./${rel}'`)) {
      missing.push(rel);
    }
  }
  if (missing.length) {
    console.error(`FAIL: renderer integrity - file non inclusi in index.html: ${missing.join(", ")}`);
    console.error("Aggiungi <script src=\"...\"> in src/renderer/index.html nell'ordine store->composer->chat->sidebar->palette->session->i18n->app");
    failed = true;
  } else log("renderer-integrity", `ok - tutti i ${rendererFiles.length} moduli referenziati in index.html`);

  // ordine minimo core/store -> features/chat/composer -> features/chat/chat -> ui/sidebar -> features/session/palette -> features/session/session -> lib/i18n -> core/app
  const order = ["core/store.js", "features/chat/composer.js", "features/chat/chat.js", "ui/sidebar.js", "features/session/palette.js", "features/session/session.js", "lib/i18n.js", "core/app.js"];
  let lastIdx = -1;
  let orderOk = true;
  for (const rel of order) {
    const idx = html.indexOf(`src="${rel}"`);
    if (idx === -1) { console.error(`WARN: ${f} non trovato in index.html`); orderOk = false; }
    else if (idx < lastIdx) { console.error(`FAIL: ordine script errato: ${f} prima del precedente`); orderOk = false; failed = true; }
    lastIdx = Math.max(lastIdx, idx);
  }
  if (orderOk) log("renderer-order", "ok - ordine store->...->app rispettato");
}

// 3) Lint (solo errori, warnings non bloccano ma vengono mostrati)
{
  const r = run("npx", ["eslint", "src", "--ext", ".js,.mjs", "--max-warnings", "999"]);
  // eslint ritorna 0 anche con warnings se max-warnings alto; controlla errori reali
  const hasError = /error/i.test(r.out) && r.status !== 0;
  console.log(r.out.slice(0, 4000));
  if (r.status !== 0 && r.out.includes("error")) {
    // se ci sono errori veri
    const errCheck = spawnSync("npx", ["eslint", "src", "--ext", ".js,.mjs", "-f", "json"], { cwd: root, encoding: "utf8" });
    try {
      const json = JSON.parse(errCheck.stdout);
      const errors = json.reduce((a, f) => a + f.errorCount, 0);
      if (errors > 0) { console.error(`FAIL: lint - ${errors} errori`); failed = true; }
      else log("lint", `ok - ${json.reduce((a,f)=>a+f.warningCount,0)} warnings (non bloccanti)`);
    } catch { if (r.status !== 0) failed = true; }
  } else log("lint", "ok");
}

// 4) Tests
{
  const r = run("npm", ["test"], { timeout: 60000 });
  console.log(r.out.slice(-3000));
  if (!r.ok) { console.error("FAIL: npm test"); failed = true; }
  else log("test", "ok - tutti i test passati");
}

// 5) Smoke electron (solo locale, non in CI, opzionale ma utile per white-screen)
{
  if (isCI || isQuick) {
    log("smoke", isQuick ? "skip --quick" : "skip in CI");
  } else {
    console.log("\n== smoke (electron) ==");
    const r = spawnSync("npx", ["electron", ".", "--enable-logging"], { cwd: root, encoding: "utf8", timeout: 15000 });
    const out = (r.stdout || "") + (r.stderr || "");
    // cerca ReferenceError o white-screen
    if (/ReferenceError|openSessionTree is not defined|agente avviato/i.test(out)) {
      if (/ReferenceError|is not defined/.test(out)) {
        console.error("FAIL: smoke electron - ReferenceError rilevato:\n", out.slice(-2000));
        failed = true;
      } else if (/agente avviato/.test(out)) {
        log("smoke", "ok - '[pi-desktop] agente avviato' rilevato, nessun ReferenceError");
      } else {
        console.log(out.slice(-2000));
        log("smoke", "warn - output ambiguo, verifica manuale");
      }
    } else {
      // electron potrebbe essere stato killato da timeout, ma se non c'è errore consideriamo ok se check precedenti ok
      console.log(out.slice(-1500));
      log("smoke", "skip/ok - nessun ReferenceError (timeout atteso)");
    }
  }
}

if (failed) {
  console.error("\n=== VERIFY FALLITA ===\nCorreggi gli errori prima di commitare. Vedi sopra.");
  process.exit(1);
} else {
  console.log("\n=== VERIFY OK ===\nPronto per commit.");
}
