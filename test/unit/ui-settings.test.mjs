"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const uiSettings = require("../../src/renderer/lib/ui-settings.js");

test("ui-settings: resolves theme and notifications from settings", () => {
  const storage = {
    data: new Map(),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, v); },
  };
  assert.equal(uiSettings.resolvedTheme({ theme: "dark" }, storage), "dark");
  assert.equal(uiSettings.notificationsEnabled({ notificationsEnabled: false }, storage), false);
  assert.equal(uiSettings.diffMode({ diffMode: "split" }, storage), "split");
  assert.deepEqual(uiSettings.expandedProjectsList({ expandedProjects: ["/a"] }, storage), ["/a"]);
});

test("ui-settings: migrates localStorage keys into settings patch", async () => {
  const storage = {
    data: new Map([
      ["pi-desktop-theme", "dark"],
      ["pi-desktop-notifications-sound", "true"],
    ]),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, v); },
  };
  const calls = [];
  const api = {
    setSettings(patch) {
      calls.push(patch);
      return { ...patch, saveOk: true, cwd: "/tmp" };
    },
  };
  const updated = await uiSettings.migrateLocalStorageToSettings(api, { cwd: "/tmp" }, storage);
  assert.equal(updated.theme, "dark");
  assert.equal(updated.notificationsSound, true);
  assert.ok(calls.length >= 1);
});
