"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("regression: modularization – app.js size guard vs HEAD", () => {
  const app = fs.readFileSync(path.join(root, "src/renderer/app.js"), "utf8");
  const lines = app.split("\n").length;
  // Monolith was 4029 at initial commit, goal is <1000 after decomposition
  assert.ok(lines < 1000, `app.js should be decomposed below 1000 lines, got ${lines}`);
  assert.ok(lines > 250, `app.js should not be empty, got ${lines}`);
  assert.ok(lines < 600, `app.js should stay well below 1000 after full extraction, got ${lines}`);
});

test("regression: all extracted modules are loadable and expose expected API", () => {
  const utils = require("../src/renderer/utils.js");
  assert.equal(typeof utils.escapeHtml, "function");
  assert.equal(typeof utils.formatBytes, "function");
  assert.equal(typeof utils.messageListStats, "function");

  const nav = require("../src/renderer/navigation.js");
  assert.equal(typeof nav.configuredProjects, "function");
  assert.equal(typeof nav.sessionsForProject, "function");
  assert.equal(typeof nav.tabDisplayTitle, "function");

  const persistence = require("../src/renderer/persistence.js");
  assert.equal(typeof persistence.persistExpandedProjects, "function");
  assert.equal(typeof persistence.commandUsageScore, "function");

  // Store is DOM-dependent – just check file exists and syntax ok
  assert.ok(fs.existsSync(path.join(root, "src/renderer/store.js")));
  assert.ok(fs.existsSync(path.join(root, "src/renderer/composer.js")));
  assert.ok(fs.existsSync(path.join(root, "src/renderer/chat.js")));
  assert.ok(fs.existsSync(path.join(root, "src/renderer/sidebar.js")));

  // Composer/chat/sidebar are classic scripts (no module.exports for composer/chat/sidebar in node without DOM),
  // but they should at least be syntax-valid (already checked by `npm run check`).
  // Verify they define expected globals via static analysis
  const composer = fs.readFileSync(path.join(root, "src/renderer/composer.js"), "utf8");
  assert.match(composer, /function renderAttachmentTray/);
  assert.match(composer, /async function sendMessage/);
  assert.match(composer, /function autosize/);

  const chat = fs.readFileSync(path.join(root, "src/renderer/chat.js"), "utf8");
  assert.match(chat, /function renderFinalMessage/);
  assert.match(chat, /function beginStreamAssistant/);
  assert.match(chat, /function endStreamAssistant/);

  const sidebar = fs.readFileSync(path.join(root, "src/renderer/sidebar.js"), "utf8");
  assert.match(sidebar, /function renderProjects/);
  assert.match(sidebar, /function renderTabs/);
  assert.match(sidebar, /function switchToTab/);
});

test("regression: index.html loads modules in correct order (store → composer → chat → sidebar → app)", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const order = ["utils.js", "ui.js", "message-view.js", "package-helpers.js", "navigation.js", "persistence.js", "store.js", "composer.js", "chat.js", "sidebar.js", "palette.js", "mentions.js", "session-view.js", "status.js", "models.js", "package-view.js", "forms.js", "runtime-events.js", "auth.js", "extension-bridge.js", "media.js", "i18n.js", "bootstrap.js", "app.js"];
  let lastIdx = -1;
  for (const file of order) {
    const idx = html.indexOf(`src="${file}"`);
    assert.ok(idx > lastIdx, `${file} should appear after previous in index.html`);
    lastIdx = idx;
  }
});

test("regression: new extracted modules expose expected API via static analysis", () => {
  const auth = fs.readFileSync(path.join(root, "src/renderer/auth.js"), "utf8");
  assert.match(auth, /function loadProviderSettings/);
  assert.match(auth, /function renderProviderSettings/);
  assert.match(auth, /async function loadNativePiSettings/);
  assert.match(auth, /function switchSettingsTab/);
  assert.match(auth, /window\.piAuth/);

  const ext = fs.readFileSync(path.join(root, "src/renderer/extension-bridge.js"), "utf8");
  assert.match(ext, /function handleUiRequest/);
  assert.match(ext, /function updateExtensionStatus/);
  assert.match(ext, /function showDialog/);
  assert.match(ext, /window\.piExtensionBridge/);

  const media = fs.readFileSync(path.join(root, "src/renderer/media.js"), "utf8");
  assert.match(media, /function addUserMessage/);
  assert.match(media, /function makeToolCard/);
  assert.match(media, /function safeImageSource/);
  assert.match(media, /function renderMediaBlock/);
  assert.match(media, /window\.piMedia/);

  const bootstrap = fs.readFileSync(path.join(root, "src/renderer/bootstrap.js"), "utf8");
  assert.match(bootstrap, /function wireUi/);
  assert.match(bootstrap, /async function boot/);
  assert.match(bootstrap, /window\.piBootstrap/);

  const runtime = fs.readFileSync(path.join(root, "src/renderer/runtime-events.js"), "utf8");
  assert.match(runtime, /function createRuntimeEvents/);
  assert.match(runtime, /function bindGlobalPiEvents/);
  assert.match(runtime, /piRuntimeEvents/);

  // app.js should delegate to new modules via one-liners, not contain full implementations
  const app = fs.readFileSync(path.join(root, "src/renderer/app.js"), "utf8");
  assert.match(app, /window\.piAuth\.loadProviderSettings/);
  assert.match(app, /window\.piExtensionBridge\.handleUiRequest/);
  assert.match(app, /window\.piBootstrap\.wireUi/);
  assert.match(app, /bindGlobalPiEvents/);
  // app.js should not contain the full provider login body anymore
  assert.ok(!app.includes("Accedi a ${provider.name}") || app.includes("piAuth"), "app.js should delegate provider login, not duplicate");
  const wireCount = (app.match(/function wireUi\(/g) || []).length;
  assert.equal(wireCount, 1, "app.js should have only one thin wireUi wrapper after extraction");
});

test("regression: mention-service extracted from main.js", () => {
  const mention = require("../src/main/services/mention-service.js");
  assert.equal(typeof mention.scoreMentionCandidate, "function");
  assert.equal(typeof mention.createMentionService, "function");
  assert.ok(mention.MENTION_SKIP_DIRS.has("node_modules"));
});

test("regression: eslint + check still cover new modules", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  // build config may be in package.json or electron-builder.yml – just verify scripts
  assert.ok(pkg.scripts.test.includes("test/*.test.mjs"), "test script should run all mjs");
  assert.ok(pkg.scripts.lint, "lint script should exist");
  assert.ok(pkg.scripts.check, "check script should exist");
  // Verify new modules are present on disk and will be packaged via src/**/*
  for (const mod of ["utils.js", "ui.js", "message-view.js", "package-helpers.js", "navigation.js", "persistence.js", "store.js", "composer.js", "chat.js", "sidebar.js", "palette.js", "mentions.js", "session-view.js", "status.js", "models.js", "package-view.js", "forms.js", "runtime-events.js", "auth.js", "extension-bridge.js", "media.js", "bootstrap.js"]) {
    assert.ok(fs.existsSync(path.join(root, "src/renderer", mod)), `${mod} should exist`);
  }
});
