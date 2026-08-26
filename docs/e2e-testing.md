# Test E2E Playwright (Electron)

Suite end-to-end che avvia l'app Electron reale contro un **mockup gigante di dati**
e misura le performance di switch/rendering, così da intercettare prima le regressioni
di velocita' e i problemi di integrazione renderer/main.

## Avvio

```bash
npm run test:e2e        # intera suite (~30s)
npm run test:e2e:perf   # solo i test @perf di misurazione
```

Non serve `npx playwright install`: usiamo solo `_electron.launch()`, nessun browser scaricato.
Richiede il binario `pi` nel PATH solo per le suite che aprono sessioni reali (le spec ermetiche
della sidebar girano senza).

## Fixture gigante (`e2e/_fixtures/generate.mjs`)

Generatore deterministico (seed fisso -> stessi dati a ogni run):

- **12 progetti**, **~133 sessioni**, **~25.000 messaggi** totali (~12MB)
- 4 "chat lunghissime" da 3000-6000 messaggi (con blocchi codice e testo lungo)
- sessioni vuote (edge case), titoli/preview realistici in italiano
- formato JSONL identico a quello letto da `src/main/services/sessions.js`
  (header `type:"session"` + catena `id`/`parentId`)
- scrive anche `userdata/settings.json` puntato su queste fixture

Output in `e2e/.artifacts/fixtures/` (gitignored). Rigenerazione manuale:
`node e2e/_fixtures/generate.mjs --force`

## Isolamento dell'app sotto test

`launchApp()` (in `e2e/helpers/app.mjs`) copia la userData in una dir temporanea e
lancia Electron con `PI_DESKTOP_USER_DATA=<tmp>` (supportato da `src/main/core/main.js`):
lock single-instance, settings e sessioni sono completamente separati dall'app installata
e dallo sviluppo. L'env viene ripulito da `ELECTRON_RUN_AS_NODE` (impostato da IDE tipo Cursor).

## Cosa copre la suite

| Suite | Copertura |
|---|---|
| `sidebar.spec.mjs` | ermetica: rendering 12 progetti, conteggi, limite 6/"mostra altre N", ricerca, refresh <2s, zero errori console |
| `chat-tabs.spec.mjs` | apertura sessioni -> tab separati, alternanza switch, **isolamento contesto input per tab**, dedup "Nuova chat" su tab vuoto |
| `perf-switch.spec.mjs` | @perf: 36 switch tra 6 chat caricate, budget p50<600ms / p95<2000ms |
| `perf-long-chat.spec.mjs` | @perf: apertura chat 6000 messaggi <150s, scroll estremo senza long task fuori budget |

## Metriche

Ogni misura viene salvata in `e2e/.artifacts/metrics/*.json` con distribuzione completa
(min/p50/p90/p95/max + tutte le durate). I valori tipici su macchina dev:

| Operazione | Valore osservato |
|---|---|
| switch tra chat caricate | p50 ~80ms, p95 ~150ms |
| apertura sessione 6000 msg | ~1.2s (il runtime espone una finestra di 100 messaggi) |
| refresh lista sidebar (133 sessioni) | p95 ~6ms |

I budget nelle asserzioni sono volutamente larghi (~5-10x i valori osservati):
bloccano le regressioni grossi senza essere flaky.

## Note sui percorsi usati dalle spec

La sidebar viene ricostruita da zero a ogni refresh (anche ogni 10s): per aprire sessioni
le spec NON cliccano gli item del DOM ma invocano gli stessi entry-point di produzione
(`piDesktop.openSession` IPC + `switchToTab`), replicando stash/restore del contesto.
Il click sul bottone "Nuova chat" quando il tab corrente e' gia' vuoto riusa il tab
(dedup voluto in `RuntimeTabs.newSession`) e mostra ora un toast informativo.
