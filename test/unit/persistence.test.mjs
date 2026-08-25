"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const persistence = require("../../src/renderer/lib/persistence.js");

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    _store: store,
  };
}

test("persistence: expanded projects roundtrip", () => {
  const storage = fakeStorage();
  const set = new Set(["/a", "/b"]);
  persistence.persistExpandedProjects(set, storage);
  assert.equal(JSON.parse(storage._store[persistence.EXPANDED_PROJECTS_KEY]).length, 2);
  const restored = new Set();
  persistence.restoreExpandedProjects(restored, storage);
  assert.deepEqual([...restored].sort(), ["/a", "/b"]);
});

test("persistence: restore ignores bad JSON / non-array / empty", () => {
  const storage = fakeStorage({ [persistence.EXPANDED_PROJECTS_KEY]: "not-json" });
  const set = new Set();
  persistence.restoreExpandedProjects(set, storage);
  assert.equal(set.size, 0);
  storage._store[persistence.EXPANDED_PROJECTS_KEY] = JSON.stringify("string-not-array");
  persistence.restoreExpandedProjects(set, storage);
  assert.equal(set.size, 0);
});

test("persistence: set/toggle use persist", () => {
  const storage = fakeStorage();
  const set = new Set(["/a"]);
  persistence.setProjectExpanded(set, "/b", true, storage);
  assert.ok(set.has("/b"));
  persistence.setProjectExpanded(set, "/a", false, storage);
  assert.ok(!set.has("/a"));
  persistence.toggleProjectExpanded(set, "/c", storage);
  assert.ok(set.has("/c"));
  persistence.toggleProjectExpanded(set, "/c", storage);
  assert.ok(!set.has("/c"));
});

test("persistence: commandUsage score decays", () => {
  const now = 1_000_000_000_000;
  const usage = { build: { count: 2, lastUsed: now - 5 * 86400000 }, old: { count: 5, lastUsed: now - 40 * 86400000 } };
  assert.ok(persistence.commandUsageScore(usage, "build", now) > 200);
  assert.ok(persistence.commandUsageScore(usage, "old", now) === 500); // 5*100 + 0 decay
  assert.equal(persistence.commandUsageScore(usage, "missing", now), 0);
  const storage = fakeStorage();
  const cu = {};
  persistence.recordCommandUsage(cu, "build", storage, now);
  assert.equal(cu.build.count, 1);
  persistence.recordCommandUsage(cu, "build", storage, now + 1000);
  assert.equal(cu.build.count, 2);
  assert.ok(storage._store[persistence.COMMAND_USAGE_KEY].includes("build"));
  // missing name no-op
  persistence.recordCommandUsage(cu, "", storage, now);
  assert.equal(Object.keys(cu).length, 1);
});
