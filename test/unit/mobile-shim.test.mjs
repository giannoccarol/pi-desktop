import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mobileWeb = require("../../src/main/services/mobile-web.js");

// Regressione: lo shim window.piDesktop è generato a runtime e uno join senza
// virgole ha prodotto "Unexpected identifier 'setSettings'", lasciando
// window.piDesktop undefined e crashando il boot (niente icone, niente chat).
test("mobile shim: il JS generato è sintatticamente valido", () => {
  const src = mobileWeb._shimJs();
  assert.ok(src.includes("window.piDesktop"), "espone window.piDesktop");
  vm.compileFunction(src, [], { filename: "shim.js" });
});

test("mobile shim: tutti i metodi sono identificatori validi e on() esiste", () => {
  const src = mobileWeb._shimJs();
  for (const m of src.matchAll(/^  ([A-Za-z_$][\w$]*)\(\.\.\.a\)/gm)) {
    assert.match(m[1], /^[A-Za-z_$][\w$]*$/);
  }
  assert.match(src, /on\(channel,cb\)/);
});
