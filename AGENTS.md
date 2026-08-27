# Istruzioni per Agents - Pi Desktop

> **REGOLA OBBLIGATORIA prima di ogni commit**: esegui `npm run verify` (o almeno `npm run verify:quick`) e assicurati che sia verde. Non committare se fallisce.

Questo repository è Electron + renderer modulare. Il bug dello schermo bianco (`ReferenceError: openSessionTree is not defined` in `src/renderer/app.js:2184`) è stato causato da `src/renderer/session.js:63` estratto in `21b8faf` ma non incluso in `src/renderer/index.html:465`. `npm run check` e `npm test` da soli NON lo rilevavano.

## Checklist pre-commit (usata da `scripts/verify.js` e hook `.git/hooks/pre-commit`)

Eseguita automaticamente al `git commit` se gli hook sono installati (`npm run prepare` lo fa su `npm install`). Gli agents devono comunque lanciarla esplicitamente:

```bash
npm run verify:quick  # check + lint + renderer integrity + tests (veloce, ~5s)
# oppure completo con smoke electron (rileva white-screen):
npm run verify        # include smoke electron --enable-logging (15s)
```

Cosa verifica `scripts/verify.js`:

1. **Syntax** `npm run check` (`node --check` su tutti i `src/**/*.js`) — `src/renderer/app.js:*`, `src/main/main.js:*`, ecc.
2. **Renderer integrity** — ogni `src/renderer/*.js` deve avere `<script src="...">` in `src/renderer/index.html:*:`. Ordine obbligatorio:
   `lib/utils.js -> lib/persistence.js -> lib/ui-settings.js -> core/store.js -> features/chat/composer.js -> ... -> core/app.js`
   Se estrai un modulo, aggiungilo qui altrimenti white-screen.
3. **Lint** `npm run lint` — 0 errori (warnings ok)
4. **Tests** `npm test` — 55 tests, su Windows i check `0o600` sono skippati (`test/rpc.test.mjs:224`, `320`)
5. **Smoke Electron** (solo `verify` completo, non `--quick`) — avvia `npx electron . --enable-logging` e verifica che non ci sia `ReferenceError` e che compaia `[pi-desktop] agente avviato` (`src/renderer/app.js:2531`)

## Come committare correttamente

```bash
# 1. Modifica i file
# 2. Verifica
npm run verify:quick  # o npm run verify per sicurezza
# 3. Se verde, committa
git add -A && git commit -m "fix(renderer): ..."
# Il pre-commit hook rifarà la stessa verifica e bloccherà il commit se fallisce
```

## Hook Git

- Sorgente versionato: `scripts/githooks/pre-commit`
- Installato in `.git/hooks/pre-commit` via `node scripts/install-hooks.js` (chiamato automaticamente da `npm run prepare` su `npm install`)
- Se la CI su Windows fallisce con `438 !== 384` (`test/rpc.test.mjs:224`/`320`), è il check permessi Unix `0o600` non applicabile su Windows — ora fixato con `if (process.platform !== "win32")`

## CI

- Linux: `npm run check && npm run lint && npm test && electron-builder --linux --dir`
- Windows: `npm test` + `electron-builder --win --dir` (ora passa, mode 0600 skippato)
- Se aggiungi un nuovo `src/renderer/*.js`, ricordati di aggiornare `test/modularization.test.mjs:62` che controlla l'ordine degli script.

## Se vedi schermo bianco

1. `npx electron . --enable-logging` → cerca `Uncaught ReferenceError` in console
2. Verifica che ogni funzione usata in `wireUi()` (`src/renderer/app.js:2107`) sia definita e che il suo file sia in `index.html`
3. `npm run verify` ti dirà esattamente quale modulo manca (`FAIL: renderer integrity`)

## Test E2E Playwright

Suite Electron end-to-end con mockup gigante (12 progetti / ~25k messaggi) e misurazione
delle performance di switch/rendering. Documentazione completa: `docs/e2e-testing.md`.

```bash
npm run test:e2e        # intera suite (~30s, richiede il binario `pi` per le spec runtime)
npm run test:e2e:perf   # solo misurazioni @perf con budget p50/p95
```

Le metriche finiscono in `e2e/.artifacts/metrics/`. Non serve `playwright install`.
