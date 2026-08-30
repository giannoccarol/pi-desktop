"use strict";
// Generatore di fixture gigante per la suite e2e Playwright di Pi Desktop.
//
// Crea un albero di progetti + sessioni JSONL nello stesso formato letto da
// src/main/services/sessions.js (header type:"session" + catena id/parentId)
// e un userData isolato con settings.json puntato su queste fixture.
//
// Uso: node e2e/_fixtures/generate.mjs [--root DIR] [--projects N] [--force]
//
// Deterministico: stesso seed -> stessi dati, così le asserzioni sui conteggi
// nelle spec sono stabili.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ---------- PRNG deterministico ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x5eed);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

function parseArgs(argv) {
  const out = { root: path.resolve("e2e/.artifacts/fixtures"), projects: 12, force: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--root") out.root = path.resolve(argv[++i]);
    else if (argv[i] === "--projects") out.projects = Number(argv[++i]);
    else if (argv[i] === "--force") out.force = true;
  }
  return out;
}

const args = parseArgs(process.argv);

// ---------- Contenuti realistici ----------
const ARGOMENTI = [
  "il bug del white screen", "la cache delle sessioni", "il rendering della tab bar",
  "lo scroll della chat lunga", "il preload allowlist", "l'aggiornamento del modello",
  "il dedup dei tab vuoti", "la sanitizzazione IPC", "il warm start dell'agente",
  "il resize della sidebar", "le performance del diff viewer", "il menu tray",
];
const DOMANDE = [
  (a) => `Come mai quando apro ${a} l'app sembra bloccarsi per qualche secondo?`,
  (a) => `Puoi rivedere ${a}? Ho paura ci sia una race condition.`,
  (a) => `Perché ${a} non viene invalidato quando cambio progetto?`,
  (a) => `Dovremmo aggiungere un test per ${a}, cosa mi suggerisci?`,
  (a) => `Sto vedendo un jitter strano su ${a} dopo lo switch di chat, idea?`,
];
const RISPOSTE_LUNGHE = [
  `Ho analizzato il flusso completo. Il problema nasce nel momento in cui il renderer richiede la lista mentre il main sta ancora scrivendo la cache:\n\n1. \`listSessions()\` legge la directory\n2. la cache scatta con TTL 750ms\n3. il renderer chiama due volte in rapida successione\n\nLa soluzione più robusta è invalidare esplicitamente la cache dopo ogni mutazione invece di affidarsi al solo TTL.`,
  `Il punto chiave è qui:\n\n\`\`\`js\nconst previousTabId = state.activeTabId;\nawait newChat();\nif (state.activeTabId === previousTabId) {\n  toast("Sei già su una chat vuota");\n}\n\`\`\`\n\nSe \`newSession()\` riusa il tab corrente, \`activeTabId\` non cambia: è il segnale che dobbiamo usare per dare feedback all'utente invece di un no-op silenzioso.`,
  `Ho fatto un profilo con performance.mark attorno allo switch: il costo dominante è il re-render completo della sidebar (innerHTML reset). Con oltre 200 sessioni conviene fare keyed reconciliation come fa già renderTabs() con la mappa \`:scope > .chat-tab\`.`,
  `Sul lungo periodo direi:\n\n- virtualizzare i messaggi oltre i 1000 nodi\n- spostare il parsing markdown fuori dal percorso critico\n- misurare con PerformanceObserver i long task durante lo scroll\n\nCosì intercettiamo le regressioni prima che arrivino agli utenti.`,
];
const CODE_SNIPPET = [
  "```js\nif (!app.requestSingleInstanceLock({ version: APP_VERSION })) {\n  app.quit();\n}\n```",
  "```json\n{ \"type\": \"message\", \"id\": \"m1\", \"parentId\": null, \"message\": { \"role\": \"user\" } }\n```",
  "```\nnpm run verify:quick   # check + lint + integrity + tests\nnpm run verify         # + smoke electron\n```",
];

function testoDomanda() {
  const a = pick(ARGOMENTI);
  let t = pick(DOMANDE)(a);
  if (rand() < 0.3) t += `\n\nContesto: succede soprattutto con ${pick(ARGOMENTI)} aperto contemporaneamente.`;
  return t;
}
function testoRisposta(lunga) {
  const base = pick(RISPOSTE_LUNGHE);
  const body = lunga ? `${base}\n\n${base.split("\n\n")[0]}\n\nApprofondimento: ${pick(ARGOMENTI)} va gestito con un flag dedicato e test di regressione.` : base;
  return rand() < 0.35 ? `${body}\n\n${pick(CODE_SNIPPET)}` : body;
}

function msgLine(id, parentId, role, text, ts) {
  return JSON.stringify({
    type: "message",
    id,
    parentId,
    timestamp: ts,
    message: { role, content: [{ type: "text", text }] },
  });
}

// ---------- Generazione sessioni ----------
let sidCounter = 0;
let fileCounter = 0;

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function writeSession(sessionsProjectDir, projectPath, { name, messages, empty = false }) {
  const sid = `sess-fix-${String(++sidCounter).padStart(4, "0")}`;
  const file = path.join(sessionsProjectDir, `${sid}.jsonl`);
  const lines = [];
  const tsBase = Date.now() - randInt(0, 60 * 24 * 3600) * 1000; // entro 60 giorni fa
  const iso = (i) => new Date(tsBase + i * 30_000).toISOString();
  lines.push(JSON.stringify({ type: "session", version: 1, id: sid, cwd: projectPath, timestamp: iso(0) }));
  if (name) lines.push(JSON.stringify({ type: "session_info", name, id: `info-${sid}`, parentId: null, timestamp: iso(0) }));
  if (!empty) {
    let prev = null;
    for (let i = 0; i < messages; i++) {
      const id = `${sid}-m${i}`;
      const role = i % 2 === 0 ? "user" : "assistant";
      const text = role === "user" ? (i === 0 ? testoDomanda() : `Follow-up ${i}: e se provassimo con ${pick(ARGOMENTI)}?`) : testoRisposta(messages > 500 || rand() < 0.4);
      lines.push(msgLine(id, prev, role, text, iso(i)));
      prev = id;
      // NB: niente model_change/thinking_level_change: un modello inesistente
      // farebbe rifiutare l'apertura al runtime ("Model not found").
    }
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
  fileCounter++;
  return {
    file,
    id: sid,
    cwd: projectPath,
    name: name || null,
    messages: empty ? 0 : messages,
    sizeBytes: fs.statSync(file).size,
  };
}

const NOMI_SESSIONI = [
  "Fix race nella cache sessioni", "Indagine scroll chat lunga", "Refactor tab bar",
  "Debug white screen", "Migliorie sidebar", "Test switch performance", "Review IPC sanitize",
  "Warm start agente", "Menu tray rotto", "Aggiorna modello default", "Virtualizzazione messaggi", "Cleanup dev userData",
];

function main() {
  if (args.force && fs.existsSync(args.root)) fs.rmSync(args.root, { recursive: true, force: true });
  if (fs.existsSync(path.join(args.root, "manifest.json")) && !args.force) {
    console.log(`[fixtures] gia' presenti in ${args.root} (usa --force per rigenerare)`);
    console.log(fs.readFileSync(path.join(args.root, "manifest.json"), "utf8"));
    return;
  }

  const projectsRoot = path.join(args.root, "projects");
  const sessionsRoot = path.join(args.root, "sessions");
  const userDataDir = path.join(args.root, "userdata");
  fs.mkdirSync(projectsRoot, { recursive: true });
  fs.mkdirSync(sessionsRoot, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  const NOME_PROGETTI = ["pi-desktop", "themis-frontend", "api-gateway", "ml-pipeline", "design-system", "infra-terraform", "mobile-app", "analytics", "docs-site", "billing-service", "notifiche", "sandbox-lab"];
  const projectPaths = [];
  const manifest = { root: args.root, projects: [] };

  // Le prime 4 progetti ospitano anche le sessioni "mostro" (chat lunghissime).
  const MONSTERS = [
    { projectName: "pi-desktop", name: "Chat lunghissima - migrazione completa", messages: 6000 },
    { projectName: "pi-desktop", name: "Chat lunghissima - debug marathon", messages: 3000 },
    { projectName: "themis-frontend", name: "Chat lunghissima - refactor UI", messages: 3000 },
    { projectName: "api-gateway", name: "Chat lunghissima - performance audit", messages: 4500 },
  ];
  const monsterPlan = new Map(MONSTERS.map((m) => [`${m.projectName}|${m.name}`, m]));

  for (let p = 0; p < args.projects; p++) {
    const nome = NOME_PROGETTI[p % NOME_PROGETTI.length] + (p >= NOME_PROGETTI.length ? `-${p}` : "");
    const projPath = path.join(projectsRoot, nome);
    fs.mkdirSync(projPath, { recursive: true });
    const sessDir = path.join(sessionsRoot, nome);
    fs.mkdirSync(sessDir, { recursive: true });
    projectPaths.push(projPath);

    const sessions = [];
    // Sessioni mostro assegnate a questo progetto
    for (const [key, m] of monsterPlan) {
      if (key.startsWith(`${nome}|`)) {
        sessions.push(writeSession(sessDir, projPath, { name: m.name, messages: m.messages }));
        monsterPlan.delete(key);
      }
    }
    // Sessioni normali: numero e dimensione variabili
    const nSessions = randInt(6, 14);
    for (let s = 0; s < nSessions; s++) {
      const named = rand() < 0.7;
      const messages = rand() < 0.08 ? 0 : randInt(12, 140);
      sessions.push(writeSession(sessDir, projPath, {
        name: named ? `${pick(NOMI_SESSIONI)} #${p}${s}` : null,
        messages,
        empty: messages === 0,
      }));
    }
    // Almeno una sessione vuota per progetto (edge case)
    if (!sessions.some((s) => s.messages === 0)) {
      sessions.push(writeSession(sessDir, projPath, { name: "Sessione vuota", messages: 0, empty: true }));
    }

    manifest.projects.push({
      path: projPath,
      nome,
      sessionsCount: sessions.length,
      totalMessages: sessions.reduce((acc, s) => acc + s.messages, 0),
      biggestSession: sessions.reduce((acc, s) => (s.messages > (acc?.messages ?? -1) ? s : null), null)?.file ?? null,
      sessions: sessions.map((s) => ({ file: path.basename(s.file), messages: s.messages })),
    });
  }

  // settings.json per l'userData isolato dei test
  fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify({
    cwd: projectPaths[0],
    projects: projectPaths,
    piPath: "",
    sessionsDir: sessionsRoot,
    sidebarVisible: true,
    language: "it",
    lastModel: null,
    lastThinkingLevel: null,
    sessionPreferences: {},
    userName: "Tester",
    userNamePromptSeen: true,
  }, null, 2));

  const totalSessions = manifest.projects.reduce((a, p) => a + p.sessionsCount, 0);
  const totalMessages = manifest.projects.reduce((a, p) => a + p.totalMessages, 0);
  Object.assign(manifest, { totalProjects: manifest.projects.length, totalSessions, totalMessages });
  fs.writeFileSync(path.join(args.root, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`[fixtures] root=${args.root}`);
  console.log(`[fixtures] progetti=${manifest.totalProjects} sessioni=${totalSessions} messaggi_totali=${totalMessages}`);
}

main();
