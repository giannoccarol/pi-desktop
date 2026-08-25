"use strict";
// Automated tests: run with `npm test` (no pi installation required).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PiRpcClient } = require("../src/main/pi-rpc.js");
const { RuntimeTabs } = require("../src/main/runtime-tabs.js");
const sessionsStore = require("../src/main/sessions.js");
const { semverCompare } = require("../src/main/updater.js");
const providerStore = require("../src/main/provider-store.js");
const packageStore = require("../src/main/package-store.js");
const piSettingsStore = require("../src/main/pi-settings-store.js");
const { collapseRetryAttempts, hasVisibleAssistantContent } = require("../src/renderer/chat-utils.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK = path.join(__dirname, "mock-pi.js");

function startMock(extraArgs = []) {
  const client = new PiRpcClient(process.execPath, {
    rawArgs: true,
    args: [MOCK, ...extraArgs],
  });
  client.start();
  return client;
}

test("runtime tabs: switching keeps other chat runtimes alive", async () => {
  const events = [];
  const fakes = [];
  const pool = new RuntimeTabs((channel, payload) => events.push({ channel, payload }), (send) => {
    const fake = {
      running: false,
      stopped: false,
      state: { sessionFile: null, isStreaming: false },
      async ensureStarted() { this.running = true; },
      async newSession(opts) { this.running = true; this.cwd = opts.cwd; this.state = { sessionFile: null, isStreaming: false }; return { ok: true }; },
      async openSession(file, opts) { this.running = true; this.cwd = opts.cwd; this.state = { sessionFile: file, isStreaming: false }; return { ok: true }; },
      async getState() { return this.state; },
      async getMessages() { return { messages: [] }; },
      stop() { this.running = false; this.stopped = true; },
      emit(type) { this.state.isStreaming = type === "agent_start"; send("pi:event", { type }); },
    };
    fakes.push(fake);
    return fake;
  });

  const first = await pool.start({ cwd: "/project-a", persist: false });
  fakes[0].emit("agent_start");
  const second = await pool.newSession({ cwd: "/project-b" });

  assert.notEqual(first.tabId, second.tabId);
  assert.equal(fakes.length, 2);
  assert.equal(fakes[0].stopped, false);
  assert.equal(pool.list().find((tab) => tab.id === first.tabId).busy, true);
  assert.equal(pool.list().find((tab) => tab.id === second.tabId).active, true);
  pool.activate(first.tabId);
  assert.equal(pool.list().find((tab) => tab.id === first.tabId).active, true);
  assert.ok(events.some((event) => event.payload.tabId === first.tabId && event.payload.type === "agent_start"));
  pool.stop();
});

test("rpc: framing survives U+2028/U+2029 inside JSON strings and correlates ids", async () => {
  const client = startMock();
  try {
    // Fire several concurrent requests to prove id correlation.
    const [a, b] = await Promise.all([client.request({ type: "get_state" }), client.request({ type: "get_messages" })]);
    assert.equal(a.success, true);
    assert.equal(a.data.model.provider, "mock");
    assert.equal(b.success, true);
    assert.ok(Array.isArray(b.data.messages));

    const msgs = await client.call({ type: "get_available_models" });
    assert.equal(msgs.models.length, 2);
  } finally {
    client.kill();
  }
});

test("rpc: prompt streams deltas (with unicode separators) until settled", async () => {
  const client = startMock();
  let text = "";
  let toolName = null;
  const done = new Promise((resolve) => {
    client.on("message", (msg) => {
      if (msg.type === "message_update") {
        const e = msg.assistantMessageEvent;
        if (e.type === "text_delta") text += e.delta;
        if (e.type === "toolcall_start") toolName = e.toolName;
      }
      if (msg.type === "agent_settled") resolve();
    });
  });
  const res = await client.request({ type: "prompt", message: "hello" });
  assert.equal(res.success, true);
  await done;
  assert.equal(text, "ciao\u2028LINE-SEP\u2029 mondo"); // readline would have broken this
  assert.equal(toolName, "bash");
  client.kill();
});

test("rpc: call() rejects on success:false", async () => {
  const client = startMock();
  await assert.rejects(() => client.call({ type: "set_model" }), /missing fields/);
  client.kill();
});

test("rpc: native session, command, compact, export and shell commands are bridged", async () => {
  const client = startMock();
  try {
    const commands = await client.call({ type: "get_commands" });
    assert.equal(commands.commands[1].source, "extension");
    assert.equal((await client.call({ type: "get_tree" })).leafId, "m1");
    assert.equal((await client.call({ type: "get_entries", since: "m0" })).entries.length, 1);
    assert.equal((await client.call({ type: "get_fork_messages" })).messages[0].entryId, "m1");
    assert.equal((await client.call({ type: "fork", entryId: "m1" })).leafId, "m1");
    assert.equal((await client.call({ type: "clone" })).sessionFile, "/tmp/cloned.jsonl");
    assert.equal((await client.call({ type: "get_last_assistant_text" })).text, "Salve!");
    assert.equal((await client.call({ type: "compact", customInstructions: "short" })).summary, "compact");
    assert.equal((await client.call({ type: "export_html", outputPath: "/tmp/a.html" })).outputPath, "/tmp/a.html");
    assert.equal((await client.call({ type: "bash", command: "pwd" })).exitCode, 0);
    for (const command of [
      { type: "set_session_name", name: "Test" },
      { type: "set_auto_compaction", enabled: true },
      { type: "set_auto_retry", enabled: true },
      { type: "abort_retry" },
      { type: "set_steering_mode", mode: "all" },
      { type: "set_follow_up_mode", mode: "one-at-a-time" },
      { type: "abort_bash" },
    ]) await client.call(command);
  } finally {
    client.kill();
  }
});

test("updater: compares installed and registry semantic versions", () => {
  assert.equal(semverCompare("0.83.0", "0.84.3"), -1);
  assert.equal(semverCompare("0.84.3", "0.84.3"), 0);
  assert.equal(semverCompare("0.85.0", "0.84.3"), 1);
});

test("providers: preserves OAuth entries, masks keys, and writes auth.json with mode 0600", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-desktop-auth-"));
  const authFile = path.join(dir, "auth.json");
  fs.writeFileSync(authFile, JSON.stringify({
    anthropic: { type: "oauth", access: "oauth-secret" },
    custom: { type: "api_key", key: "keep-me" },
  }));

  const configured = providerStore.setApiKey("openai", "sk-test-12345678", authFile);
  const auth = JSON.parse(fs.readFileSync(authFile, "utf8"));
  assert.equal(auth.anthropic.type, "oauth");
  assert.equal(auth.custom.key, "keep-me");
  assert.equal(auth.openai.key, "sk-test-12345678");
  assert.equal(fs.statSync(authFile).mode & 0o777, 0o600);
  assert.match(configured.find((provider) => provider.id === "openai").masked, /5678$/);

  providerStore.removeCredential("openai", authFile);
  const afterRemove = JSON.parse(fs.readFileSync(authFile, "utf8"));
  assert.equal(afterRemove.openai, undefined);
  assert.equal(afterRemove.anthropic.type, "oauth");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("providers: refuses to overwrite malformed auth.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-desktop-auth-bad-"));
  const authFile = path.join(dir, "auth.json");
  fs.writeFileSync(authFile, "{not-json");
  assert.throws(() => providerStore.setApiKey("openai", "secret", authFile), /Impossibile modificare auth\.json/);
  assert.equal(fs.readFileSync(authFile, "utf8"), "{not-json");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("providers: detects environment credentials and protects OAuth-only providers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-desktop-auth-env-"));
  const authFile = path.join(dir, "auth.json");
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "secret-from-environment";
  try {
    const groq = providerStore.listProviders(authFile).find((provider) => provider.id === "groq");
    assert.equal(groq.configured, true);
    assert.equal(groq.credentialType, "environment");
    assert.equal(groq.removable, false);
    assert.equal(groq.masked, "Variabile d’ambiente");
    assert.throws(() => providerStore.setApiKey("openai-codex", "not-allowed", authFile), /OAuth/);
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("package store: validates npm names and parses pi list output", () => {
  assert.equal(packageStore.validatePackageName("@scope/pi-tools"), "@scope/pi-tools");
  assert.throws(() => packageStore.validatePackageName("npm:bad;name"), /non valido/);
  assert.throws(() => packageStore.validatePackageName("../package"), /non valido/);
  const packages = packageStore.parseListOutput([
    "User packages:",
    "  npm:pi-web-access",
    "    /home/example/.pi/agent/npm/pi-web-access",
    "",
    "Project packages:",
    "  npm:@scope/pi-tools@1.2.0 (filtered)",
    "    /work/project/.pi/npm/scope/pi-tools",
  ].join("\n"));
  assert.deepEqual(packages, [
    { source: "npm:pi-web-access", scope: "user" },
    { source: "npm:@scope/pi-tools@1.2.0", scope: "project" },
  ]);
});

test("package store: validates npm/git/local sources and scopes without shell parsing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-desktop-package-"));
  try {
    assert.equal(packageStore.validateSource("npm:@scope/pi-tools@1.2.3", { cwd: dir }), "npm:@scope/pi-tools@1.2.3");
    assert.equal(packageStore.validateSource("git:https://github.com/example/pi-tools.git@main", { cwd: dir }), "git:https://github.com/example/pi-tools.git@main");
    assert.equal(packageStore.validateSource(".", { cwd: dir }), dir);
    assert.equal(packageStore.validateScope("project"), "project");
    assert.throws(() => packageStore.validateSource("git:--upload-pack evil", { cwd: dir }), /non valida/);
    assert.throws(() => packageStore.validateSource("../missing", { cwd: dir }), /non esiste/);
    assert.throws(() => packageStore.validateScope("system"), /Scope/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("native Pi settings: writes global settings and explicit project trust safely", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-desktop-settings-"));
  const project = path.join(dir, "project");
  fs.mkdirSync(path.join(project, ".pi"), { recursive: true });
  fs.writeFileSync(path.join(project, ".pi", "SYSTEM.md"), "local rules");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(dir, "agent");
  try {
    piSettingsStore.setGlobal(project, {
      defaultProjectTrust: "ask",
      transport: "websocket",
      defaultTools: ["read", "bash", "invalid"],
      enabledModels: ["openai/gpt-*"],
      compaction: { enabled: true, reserveTokens: 9000, keepRecentTokens: 12000 },
      retry: { enabled: false, maxRetries: 2, baseDelayMs: 500 },
      images: { autoResize: true, blockImages: false },
    });
    let data = piSettingsStore.get(project);
    assert.equal(data.effective.transport, "websocket");
    assert.deepEqual(data.global.defaultTools, ["read", "bash"]);
    assert.equal(data.trust.projectTrusted, false);
    piSettingsStore.setTrust(project, true);
    data = piSettingsStore.get(project);
    assert.equal(data.trust.projectTrusted, true);
    assert.equal(fs.statSync(data.files.global).mode & 0o777, 0o600);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("package store: parses official pi.dev catalog cards and monthly downloads", () => {
  const catalog = packageStore.parseCatalogHtml(`
    <div class="packages-count">1-1 / 5440</div>
    <article data-package-card="true" data-package-name="@scope/pi-tools" data-package-types="extension skill" data-package-downloads="12500" data-package-date="1700000000000">
      <h3 class="packages-name"><a href="/packages/@scope/pi-tools">@scope/pi-tools</a></h3>
      <p class="packages-desc">Useful tools &amp; helpers</p>
      <div class="packages-meta"><span>author</span><span>12.5K/mo</span><span>today</span></div>
      <div class="packages-links"><a href="https://www.npmjs.com/package/@scope/pi-tools">npm</a><a href="https://github.com/example/pi-tools">repo</a><a href="https://github.com/pi/issues?package-version=1.2.3">report</a></div>
    </article>`);
  assert.equal(catalog.total, 5440);
  assert.equal(catalog.items.length, 1);
  assert.deepEqual(catalog.items[0], {
    name: "@scope/pi-tools",
    version: "1.2.3",
    description: "Useful tools & helpers",
    keywords: [],
    types: ["extension", "skill"],
    publisher: "author",
    monthlyDownloads: 12500,
    downloads: 12500,
    publishedAt: 1700000000000,
    npmUrl: "https://www.npmjs.com/package/@scope/pi-tools",
    homepage: "https://github.com/example/pi-tools",
    score: 12500,
    installSpec: "npm:@scope/pi-tools",
  });
});

test("sessions: parse fixture files and list newest-first", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-desktop-test-"));
  const proj = path.join(dir, "--home-proj--");
  fs.mkdirSync(proj);

  const writeSession = (name, ageMs) => {
    const lines = [
      JSON.stringify({ type: "session", version: 3, id: name, timestamp: new Date(Date.now() - ageMs).toISOString(), cwd: "/home/proj" }),
      JSON.stringify({ type: "session_info", id: "i1", parentId: null, timestamp: new Date().toISOString(), name: `Sess ${name}` }),
      JSON.stringify({ type: "model_change", id: "mc1", parentId: "i1", timestamp: new Date().toISOString(), provider: "openai", modelId: "gpt-test" }),
      JSON.stringify({ type: "thinking_level_change", id: "tc1", parentId: "mc1", timestamp: new Date().toISOString(), thinkingLevel: "high" }),
      JSON.stringify({
        type: "message", id: "m1", parentId: "i1", timestamp: new Date().toISOString(),
        message: { role: "user", content: "primo messaggio di prova", timestamp: Date.now() },
      }),
      JSON.stringify({
        type: "message", id: "m2", parentId: "m1", timestamp: new Date().toISOString(),
        message: { role: "assistant", content: [{ type: "text", text: "risposta" }], provider: "mock", model: "m", stopReason: "stop" },
      }),
      'linea non-JSON che va ignorata',
    ];
    const file = path.join(proj, `${Date.now() - ageMs}_${name}.jsonl`);
    fs.writeFileSync(file, lines.join("\n"));
    const past = new Date(Date.now() - ageMs);
    fs.utimesSync(file, past, past);
    return file;
  };

  const older = writeSession("old", 10 * 86400000);
  const newer = writeSession("new", 1000);

  const list = sessionsStore.listSessions(dir);
  assert.equal(list.length, 2);
  assert.equal(list[0].file, newer); // newest modified first
  assert.equal(list[1].file, older);
  assert.equal(list[0].name, "Sess new");
  assert.equal(list[0].preview, "primo messaggio di prova");
  assert.equal(list[0].cwd, "/home/proj");
  assert.equal(list[0].hasName, true);
  assert.deepEqual(list[0].preference, { provider: "openai", modelId: "gpt-test", thinkingLevel: "high" });

  sessionsStore.deleteSession(older);
  assert.equal(sessionsStore.listSessions(dir).length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("markdown: code blocks, tables, links are rendered safely", () => {
  global.window = {};
  require("../src/renderer/markdown.js");
  const md = global.window.renderMarkdown;

  const html = md("# Tit\n\n```js\nlet a = \"<script>\";\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\ngoto [x](javascript:alert(1)) e [ok](https://pi.dev)");
  assert.match(html, /<h1>/);
  assert.match(html, /codeblock/);
  assert.ok(html.includes("&lt;script&gt;"), "HTML must be escaped inside code");
  assert.match(html, /<table>/);
  assert.ok(!html.includes('href="javascript:'), "javascript: URLs must be neutralized");
  assert.ok(html.includes('href="https://pi.dev"'));

  const listHtml = md("- primo\n  - secondo\n- terzo");
  assert.ok(!listHtml.includes("•"), "list markers must be rendered by CSS, not duplicated in HTML");
  assert.match(listHtml, /<li class="nested">/);
});

test("chat: recovered provider retries are collapsed and final failures remain", () => {
  const user = { role: "user", content: "ciao" };
  const retryError = (message) => ({ role: "assistant", content: [], stopReason: "error", errorMessage: message });
  const success = { role: "assistant", content: [{ type: "text", text: "risposta" }], stopReason: "stop" };

  assert.deepEqual(collapseRetryAttempts([user, retryError("503 a"), retryError("503 b"), success]), [user, success]);

  const finalError = retryError("503 finale");
  assert.deepEqual(collapseRetryAttempts([user, retryError("503 a"), retryError("503 b"), finalError]), [user, finalError]);
});

test("chat: native image blocks count as visible assistant content", () => {
  assert.equal(hasVisibleAssistantContent([{ type: "image", data: "AA==", mimeType: "image/png" }]), true);
  assert.equal(hasVisibleAssistantContent([{ type: "thinking", thinking: "   " }]), false);
});
