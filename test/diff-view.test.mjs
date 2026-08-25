import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const diff = require("../src/renderer/diff-view.js");

test("diff-view: parseUnifiedDiff basic", () => {
  const raw = `--- a/file.js\n+++ b/file.js\n@@ -1,2 +1,2 @@\n-foo\n+bar\n context`;
  const parsed = diff.parseUnifiedDiff(raw);
  assert.equal(parsed.hunks.length, 1);
  assert.equal(parsed.hunks[0].lines.length, 3);
  assert.equal(parsed.hunks[0].lines[0].type, "removed");
  assert.equal(parsed.hunks[0].lines[0].text, "foo");
  assert.equal(parsed.hunks[0].lines[1].type, "added");
  assert.equal(parsed.hunks[0].lines[1].text, "bar");
  assert.equal(parsed.hunks[0].lines[2].type, "context");
});

test("diff-view: renderDiff added only", () => {
  const html = diff.renderDiff("edit", { path: "src/a.js", oldText: "", newText: "hello\nworld" }, "");
  assert.ok(html);
  assert.match(html, /diff-view/);
  assert.match(html, /added/);
  assert.match(html, /hello/);
  assert.match(html, /world/);
});

test("diff-view: renderDiff removed only", () => {
  const html = diff.renderDiff("write", { path: "src/b.js", oldText: "old\nline", newText: "" }, "");
  assert.ok(html);
  assert.match(html, /removed/);
  assert.match(html, /old/);
});

test("diff-view: renderDiff both added and removed", () => {
  const html = diff.renderDiff("edit", { edits: [{ oldText: "foo", newText: "bar" }, { oldText: "a", newText: "b" }] }, "");
  assert.ok(html);
  assert.match(html, /removed/);
  assert.match(html, /added/);
  assert.match(html, /foo/);
  assert.match(html, /bar/);
});

test("diff-view: renderDiff non-edit returns null", () => {
  const html = diff.renderDiff("read", { path: "src/a.js" }, "content");
  assert.equal(html, null);
});

test("diff-view: parseUnifiedDiff empty returns no hunks", () => {
  const parsed = diff.parseUnifiedDiff("");
  assert.equal(parsed.hunks.length, 0);
});
