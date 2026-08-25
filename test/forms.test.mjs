"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../src/renderer/lib/utils.js");
const { compactToolArgs } = require("../src/renderer/lib/forms.js");

test("forms: compactToolArgs delegates to utils", () => {
  assert.equal(compactToolArgs("read", {path:"/a/b/c/d/e.txt", offset:10}, "/a/b"), "c/d/e.txt · da riga 10");
  assert.match(compactToolArgs("edit", {path:"/a/file.js", edits:[{oldText:"a\nb", newText:"a\nb\nc"}]}, "/a"), /\+3/);
  assert.equal(compactToolArgs("ls", {path:"/tmp"}, "/tmp"), ".");
  assert.equal(compactToolArgs("bash", {command:"echo hi"}), "echo hi");
});
