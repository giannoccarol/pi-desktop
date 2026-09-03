"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const utils = require("../../src/renderer/lib/utils.js");
const { compactToolArgs } = require("../../src/renderer/lib/forms.js");

function loadMarkdown() {
  const code = fs.readFileSync(new URL("../../src/renderer/lib/markdown.js", import.meta.url), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.renderMarkdown;
}
const md = loadMarkdown();

test("todo: parseTodoItems tollera forme diverse", () => {
  assert.deepEqual(utils.parseTodoItems([{ subject: "a", status: "completed" }, { subject: "b", status: "in_progress" }, { subject: "c" }]), [
    { title: "a", status: "completed" },
    { title: "b", status: "in_progress" },
    { title: "c", status: "pending" },
  ]);
  // oggetto con chiave tasks + titoli alternativi + flag booleani
  assert.deepEqual(utils.parseTodoItems({ tasks: [{ title: "x", done: true }, { name: "y", state: "doing" }] }), [
    { title: "x", status: "completed" },
    { title: "y", status: "in_progress" },
  ]);
  // stringa JSON, singolo task, scarti
  assert.equal(utils.parseTodoItems(JSON.stringify({ todos: [{ label: "z", status: "DONE" }] }))[0].status, "completed");
  assert.deepEqual(utils.parseTodoItems({ action: "update", subject: "fix", status: "in_progress" }), [{ title: "fix", status: "in_progress" }]);
  assert.deepEqual(utils.parseTodoItems("ok"), []);
  assert.deepEqual(utils.parseTodoItems(null), []);
});

test("todo: todoProgress conta i completati", () => {
  assert.deepEqual(utils.todoProgress([{ status: "completed" }, { status: "pending" }]), { done: 1, total: 2 });
});

test("todo: compactToolArgs riassume invece del JSON", () => {
  const s = compactToolArgs("todo", { tasks: [{ subject: "a", status: "completed" }, { subject: "b", status: "in_progress" }] });
  assert.equal(s, "1/2 · b");
  assert.equal(compactToolArgs("todo", { action: "update", subject: "fix" }), "0/1 · fix");
});

test("todo: toolIconName usa list-checks", () => {
  assert.equal(utils.toolIconName("todo"), "list-checks");
  assert.equal(utils.toolIconName("read"), "book-open");
});

test("todo: markdown checklist con checkbox reali", () => {
  const out = md("- [ ] da fare\n- [x] fatta\n- normale\n");
  assert.match(out, /task-list-item/);
  assert.match(out, /<input type="checkbox" disabled[ >]/);
  assert.match(out, /<input type="checkbox" disabled checked/);
  assert.match(out, /<li>normale<\/li>/);
  assert.equal(out.includes("[ ]"), false);
  assert.equal(out.includes("[x]"), false);
});
