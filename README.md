# Pi Desktop

Companion desktop (Electron) per il [Pi coding agent](https://pi.dev/): cronologia chat sempre a portata di mano,
switch immediato tra provider e modelli — e soprattutto **pi si aggiorna da solo, senza toccare l'app**.

## Perché è diverso

Pi Desktop **non incorpora una copia di pi**. Avvia il binario `pi` già presente sul sistema in modalità
[`--mode rpc`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#programmatic-usage)
(JSONL su stdin/stdout) e ci parla attraverso quel protocollo. Conseguenze:

- **Aggiornamenti indipendenti**: l'app espone il pulsante "Aggiorna pi" che lancia l'updater nativo
  (`pi update --self`). Nessun accoppiamento tra versione dell'app e versione dell'agente.
- **Zero lock-in**: la stessa installazione globale usata nel terminale (`~/.pi`) è la stessa che vedi nell'app.
- **Cronologia condivisa**: le sessioni restano dove le mette pi (`~/.pi/agent/sessions/**/*.jsonl`, formato ad albero).
  L'app le legge direttamente: aperte nel terminale stamattina? Le ritrovi qui.

## Funzionalità

| Area | Dettagli |
|---|---|
| 🎨 Interfaccia | layout chiaro/scuro ispirato al mockup, cronologia compatta, dock provider/modello/ragionamento e icone Lucide; tray + hotkey globale `Cmd+Shift+P`; notifiche di sistema a turno completato |
| 💬 Chat | tab multi-chat con runtime indipendenti, switch senza interrompere le chat in corso, streaming token-per-token, thinking collassabile, tool call con output e immagini live, diff-view per `edit`/`write` (unified/split, copia), virtualizzazione `IntersectionObserver` per 200+ messaggi, coda gestibile per messaggio (`Dopo`, `Forza`, modifica e rimozione), retry, Stop con recupero forzato della singola sessione e comandi shell diretti `!`/`!!` |
| ⌨️ Comandi | palette completa e IntelliSense inline digitando `/`; include comandi built-in, prompt, skill ed estensioni e ordina automaticamente quelli cliccati più spesso |
| 🗂️ Progetti e cronologia | più cartelle nella sidebar, ricerca globale, apertura via `switch_session`, `sessionDir` personalizzato e memoria di provider/modello/sforzo per chat; integrazione Git (branch/dirty) e dashboard costi/token per progetto |
| 🌳 Sessioni native | albero della conversazione, fork da un nodo, clone, nuova sessione figlia, rinomina, compattazione manuale/automatica, copia ultima risposta ed export HTML; auto-titolo intelligente |
| 📎 Composer | immagini RPC con anteprima, persistenza e visualizzazione nella cronologia, riferimenti a file locali con `@` (autocomplete file/cartella), drag&drop cartella con preview albero e limite 12 file, blocchi di codice |
| 🔀 Provider/Modelli | login guidato API key e OAuth tramite il runtime nativo di pi, provider aggiunti da estensioni, variabili d’ambiente, switch modello a caldo e thinking |
| 🧩 Package manager | catalogo [pi.dev/packages](https://pi.dev/packages), sorgenti npm/git/local, scope utente/progetto, installazione/rimozione/aggiornamento, refresh cataloghi modelli e controlli grafici equivalenti a `pi config` per estensioni, skill, prompt e temi; marketplace rating |
| 🔄 Aggiornamenti | badge versioni (npm registry), aggiornamento con `pi update --self`, installazione guidata se pi manca |
| 🧩 Estensioni | bridge dialoghi (`select`/`confirm`/`input`/`editor`), status bar, widget sopra/sotto il composer e comandi extension nell’IntelliSense |
| 🔐 Runtime nativo | trust progetto, `settings.json`, transport, tool predefiniti, modelli abilitati, shell, compaction, retry e policy immagini condivisi con la CLI |
| 📊 Status | token, costo, % contesto, directory di lavoro; notifiche opzionali con suono |

## Architettura

```
┌─────────────────────────── Electron ────────────────────────────┐
│  renderer (app.js)          preload (contextBridge)   main      │
│  UI chat/sidebar/palette ◄─► window.piDesktop       ◄─► PiRuntime ──spawn──► pi --mode rpc
│                                   │                     │                       (binario di sistema,
│                                   ▼                     ├─ sessions.js                 indipendente)
│                              IPC sicuri                 │    lettura ~/.pi/agent/sessions
│                                                         └─ updater.js  pi update --self / npm -g
└──────────────────────────────────────────────────────────────────┘
```

- **Framing protocollo**: splitter JSONL manuale solo su `\n` come richiesto dai docs RPC di pi
  (`readline` non è conforme: spezza anche su U+2028/U+2029 validi dentro le stringhe JSON).
- **Persistenza on-demand**: l'app avvia l'agente con `--no-session` mentre navighi; al primo messaggio reale
  riavvia in modo trasparente con persistenza, così lanciare l'app non crea file di sessione vuoti.
- **Sicurezza**: `contextIsolation` attivo, nessun `nodeIntegration`, CSP restrittiva, HTML escapato,
  URL e immagini validati, credenziali mai ritornate in chiaro al renderer e trust dei progetti rispettato.
- **Preferenze locali dell’interfaccia**: il ranking dei comandi slash usa solo conteggio e ultimo utilizzo in
  `localStorage`; non modifica la configurazione di pi e non salva il contenuto dei messaggi.

## Sviluppo

Requisiti: Node ≥ 20 e (per usare davvero l'agente) [pi](https://pi.dev) installato:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Poi:

```bash
npm install
npm run check   # syntax check di tutti i sorgenti
npm test        # suite: RPC nativo, settings/trust, package source, sessioni, markdown/chat
npm start       # avvia l'app
```

### Test end-to-end con un finto pi

```bash
mkdir -p /tmp/fakebin
printf '#!/bin/sh\nexec node %s "$@"\n' "$PWD/test/mock-pi.js" > /tmp/fakebin/pi
chmod +x /tmp/fakebin/pi
PATH="/tmp/fakebin:$PATH" npm start
```

## Packaging

```bash
npx electron-builder --linux deb AppImage   # o mac / win
```

La configurazione `build` è già in `package.json`.

## Copertura delle API native

L'interfaccia usa direttamente le API RPC di pi per comandi, session tree/fork/clone, entries, rename,
compaction/retry, queue mode, export, bash e widget delle estensioni. Provider e package manager vengono
caricati dall'installazione esterna selezionata, quindi nuove integrazioni native diventano disponibili senza
incorporare una seconda copia dell'agente nell'app.
