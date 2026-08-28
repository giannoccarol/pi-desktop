"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      if (force === undefined) force = !values.has(name);
      if (force) values.add(name);
      else values.delete(name);
      return force;
    },
    contains(name) { return values.has(name); },
  };
}

function makeUpdateButton() {
  const icon = {
    name: "download",
    setAttribute(name, value) {
      if (name === "data-lucide") this.name = value;
    },
  };
  const label = { textContent: "" };
  const listeners = {};
  return {
    icon,
    label,
    dataset: {},
    classList: makeClassList(["hidden"]),
    disabled: false,
    title: "",
    querySelector(selector) {
      if (selector === "[data-lucide]") return icon;
      if (selector === "span") return label;
      return null;
    },
    addEventListener(type, listener) { listeners[type] = listener; },
    async click() { return listeners.click?.(); },
  };
}

test("app updates: Settings and header share actions and use the circle loader", async () => {
  const headerButton = makeUpdateButton();
  const settingsButton = makeUpdateButton();
  const settingsStatus = { textContent: "" };
  const calls = { check: 0, download: 0, install: 0 };
  let updateListener = null;

  globalThis.window = globalThis;
  globalThis.piStore = {
    el: {
      btnAppUpdate: headerButton,
      btnCheckAppUpdate: settingsButton,
      checkAppUpdateStatus: settingsStatus,
      appVersion: { textContent: "" },
    },
    state: {},
  };
  globalThis.i18n = {
    t(key, values = {}) {
      return Object.entries(values).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        key
      );
    },
  };
  globalThis.piUtils = { escapeHtml: String };
  globalThis.piUi = { toast() {}, refreshIcons() {} };
  globalThis.piDesktop = {
    on(channel, listener) {
      if (channel === "update:state") updateListener = listener;
    },
    async getAppUpdateState() {
      return {
        status: "available",
        currentVersion: "1.0.0",
        availableVersion: "2.0.0",
        autoInstall: true,
      };
    },
    async checkAppUpdate() {
      calls.check += 1;
      return { state: { status: "idle", currentVersion: "1.0.0", autoInstall: true } };
    },
    async downloadAppUpdate() {
      calls.download += 1;
      return {
        state: {
          status: "downloaded",
          currentVersion: "1.0.0",
          availableVersion: "2.0.0",
          autoInstall: true,
          progress: 100,
        },
      };
    },
    async installAppUpdate() {
      calls.install += 1;
      return { success: true };
    },
  };

  delete require.cache[require.resolve("../../src/renderer/ui/status.js")];
  require("../../src/renderer/ui/status.js");
  const status = globalThis.piStatus;
  await status.setupAppUpdates();

  assert.equal(settingsButton.label.textContent, "settings.downloadAvailable");
  assert.equal(settingsButton.icon.name, "download");
  await settingsButton.click();
  assert.equal(calls.download, 1);
  assert.equal(settingsButton.label.textContent, "settings.restartToUpdate");
  assert.equal(settingsButton.icon.name, "refresh-cw");

  updateListener({
    status: "downloading",
    currentVersion: "1.0.0",
    availableVersion: "2.0.0",
    autoInstall: true,
    progress: 42,
  });
  assert.equal(headerButton.icon.name, "loader-circle");
  assert.equal(settingsButton.icon.name, "loader-circle");
  assert.equal(headerButton.classList.contains("is-downloading"), true);
  assert.equal(settingsButton.classList.contains("is-downloading"), true);

  status.handleAppUpdateState({
    status: "downloaded",
    currentVersion: "1.0.0",
    availableVersion: "2.0.0",
    autoInstall: true,
    progress: 100,
  });
  assert.equal(headerButton.icon.name, "refresh-cw");
  assert.equal(headerButton.classList.contains("is-downloading"), false);
  await settingsButton.click();
  assert.equal(calls.install, 1);
  assert.equal(calls.check, 0);
});
