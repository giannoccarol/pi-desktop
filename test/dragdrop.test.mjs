"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const drag = require("../src/renderer/dragdrop.js");

test("dragdrop: filterIgnoredPaths removes skip dirs and dotfiles", () => {
  const input = ["src/app.js", "node_modules/foo.js", ".git/HEAD", "dist/bundle.js", "src/.hidden/file.js", "valid/file.txt"];
  const out = drag.filterIgnoredPaths(input);
  assert.deepEqual(out, ["src/app.js", "valid/file.txt"]);
});

test("dragdrop: normalizeEntries handles strings and objects", () => {
  const entries = ["a/b/c.js", { path: "x/y", dir: true }, "folder/"];
  const norm = drag.normalizeEntries(entries);
  assert.deepEqual(norm, [
    { path: "a/b/c.js", dir: false },
    { path: "x/y", dir: true },
    { path: "folder", dir: true },
  ]);
});

test("dragdrop: buildFileTree creates nested structure", () => {
  const tree = drag.buildFileTree(["a/b/c.js", "a/b/d.js", "a/e.js", "x/y/z.js"]);
  assert.ok(tree.children.a);
  assert.ok(tree.children.a.children.b);
  assert.ok(tree.children.a.children.b.children["c.js"]);
  assert.equal(tree.children.a.children.b.children["c.js"].isFile, true);
  assert.equal(tree.children.a.children["e.js"].isFile, true);
  assert.equal(tree.children.x.children.y.children["z.js"].isFile, true);
  // dirs should not be files
  assert.equal(tree.children.a.isFile, false);
  assert.equal(tree.children.a.children.b.isFile, false);
});

test("dragdrop: buildFileTree respects dir entries", () => {
  const tree = drag.buildFileTree([{ path: "a/b", dir: true }, { path: "a/b/c.js", dir: false }]);
  assert.equal(tree.children.a.children.b.isFile, false);
  assert.equal(tree.children.a.children.b.children["c.js"].isFile, true);
});

test("dragdrop: buildFileTree filters ignored paths", () => {
  const tree = drag.buildFileTree(["src/app.js", "node_modules/foo.js", "valid/file.txt"]);
  assert.ok(tree.children.src);
  assert.ok(tree.children.valid);
  assert.ok(!tree.children.node_modules);
});

test("dragdrop: collectFilePaths gathers leaf files", () => {
  const tree = drag.buildFileTree(["a/b/c.js", "a/b/d.js", "a/e.js"]);
  const files = drag.collectFilePaths(tree).sort();
  assert.deepEqual(files, ["a/b/c.js", "a/b/d.js", "a/e.js"]);
});

test("dragdrop: collectAllPaths gathers files and dirs", () => {
  const tree = drag.buildFileTree(["a/b/c.js", "a/e.js"]);
  const all = drag.collectAllPaths(tree).sort();
  assert.ok(all.includes("a"));
  assert.ok(all.includes("a/b"));
  assert.ok(all.includes("a/b/c.js"));
  assert.ok(all.includes("a/e.js"));
});

test("dragdrop: expandSelectionToFiles expands dir selection", () => {
  const tree = drag.buildFileTree(["a/b/c.js", "a/b/d.js", "a/e.js", "x/y.js"]);
  const expanded = drag.expandSelectionToFiles(tree, new Set(["a/b"])).sort();
  assert.deepEqual(expanded, ["a/b/c.js", "a/b/d.js"]);
  const all = drag.expandSelectionToFiles(tree, new Set(["a"])).sort();
  assert.deepEqual(all, ["a/b/c.js", "a/b/d.js", "a/e.js"]);
  const single = drag.expandSelectionToFiles(tree, new Set(["a/e.js"]));
  assert.deepEqual(single, ["a/e.js"]);
});

test("dragdrop: toggleSelection adds and removes", () => {
  let set = new Set(["a/b"]);
  set = drag.toggleSelection(set, "x/y", null, true);
  assert.ok(set.has("x/y"));
  set = drag.toggleSelection(set, "a/b", null, false);
  assert.ok(!set.has("a/b"));
});

test("dragdrop: findNode locates nodes", () => {
  const tree = drag.buildFileTree(["a/b/c.js"]);
  assert.ok(drag.findNode(tree, "a/b"));
  assert.ok(drag.findNode(tree, "a/b/c.js"));
  assert.equal(drag.findNode(tree, "missing"), null);
});
