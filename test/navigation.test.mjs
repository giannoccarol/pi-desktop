"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nav = require("../src/renderer/navigation.js");

// stub i18n
globalThis.window = globalThis;
globalThis.i18n = { t: (k) => ({ "session.newChat": "Nuova chat" }[k] || k) };

test("navigation: configuredProjects deduplicates and filters", () => {
  assert.deepEqual(nav.configuredProjects({ projects: ["/a", "/b", "/a"], cwd: "/a" }), ["/a", "/b"]);
  assert.deepEqual(nav.configuredProjects({ cwd: "/x" }), ["/x"]);
  assert.deepEqual(nav.configuredProjects({ projects: [null, "", "/a"] }), ["/a"]);
});

test("navigation: sessionsForProject merges drafts + saved sorted", () => {
  const sessions = [
    { file: "/s/2.jsonl", cwd: "/proj", modified: 200, name: "old" },
    { file: "/s/1.jsonl", cwd: "/proj", modified: 300, name: "new" },
    { file: "/s/other.jsonl", cwd: "/other", modified: 999, name: "other" },
  ];
  const tabs = [
    { id: "1", cwd: "/proj", sessionFile: null, title: "Draft A", createdAt: 250, busy: false },
    { id: "2", cwd: "/proj", sessionFile: "/s/1.jsonl", title: "bound", createdAt: 100, busy: false }, // not draft
    { id: "3", cwd: "/proj", sessionFile: null, title: "Draft B", createdAt: 400, busy: true },
  ];
  const result = nav.sessionsForProject({ sessions, tabs }, "/proj");
  // drafts first, newest first
  assert.equal(result[0].file, "tab:3");
  assert.equal(result[1].file, "tab:1");
  // then saved sorted newest first
  assert.equal(result[2].file, "/s/1.jsonl");
  assert.equal(result[3].file, "/s/2.jsonl");
  // no other project leaked
  assert.equal(result.some((r) => r.file === "/s/other.jsonl"), false);
});

test("navigation: tabDisplayTitle prefers session name", () => {
  const sessions = [
    { file: "/s/a.jsonl", hasName: true, name: "My Chat", preview: "hello" },
    { file: "/s/b.jsonl", hasName: false, preview: "preview text" },
  ];
  assert.equal(nav.tabDisplayTitle({ sessionFile: "/s/a.jsonl", title: "Draft" }, sessions), "My Chat");
  assert.equal(nav.tabDisplayTitle({ sessionFile: "/s/b.jsonl", title: "Draft" }, sessions), "preview text");
  assert.equal(nav.tabDisplayTitle({ title: "Solo Draft" }, []), "Solo Draft");
  assert.equal(nav.tabDisplayTitle({ title: "" }, []), "Nuova chat");
});

test("navigation: tabSubtitle and tabTooltip", () => {
  const sessions = [{ file: "/s/a.jsonl", hasName: true, name: "N", preview: "hello world preview" }];
  assert.match(nav.tabSubtitle({ cwd: "/home/proj", sessionFile: "/s/a.jsonl", title: "x" }, sessions), /proj/);
  assert.equal(nav.tabSubtitle({ cwd: "/home/proj", title: "Draft" }, []), "proj");
  const tip = nav.tabTooltip({ cwd: "/home/proj", sessionFile: "/s/a.jsonl", busy: true }, "My Chat", sessions);
  assert.match(tip, /\/home\/proj/);
  assert.match(tip, /in esecuzione/);
  const tip2 = nav.tabTooltip({ cwd: "/p", title: "T" }, "T", []);
  assert.equal(tip2.split("\n").length, 2); // title + cwd, no duplicate preview
});
