import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { shouldHandoverToSecondInstance } = require("../../src/main/core/single-instance.js");

test("single-instance: handoff quando la seconda istanza ha versione diversa", () => {
  assert.equal(shouldHandoverToSecondInstance("0.9.1", { version: "0.9.2" }), true);
  // Anche un downgrade voluto deve fare handoff: conta la differenza, non la direzione
  assert.equal(shouldHandoverToSecondInstance("0.9.1", { version: "0.8.0" }), true);
});

test("single-instance: nessun handoff con stessa versione", () => {
  assert.equal(shouldHandoverToSecondInstance("0.9.1", { version: "0.9.1" }), false);
});

test("single-instance: nessun handoff da istanza legacy senza additionalData", () => {
  assert.equal(shouldHandoverToSecondInstance("0.9.1", undefined), false);
  assert.equal(shouldHandoverToSecondInstance("0.9.1", null), false);
});

test("single-instance: nessun handoff con additionalData malformati", () => {
  assert.equal(shouldHandoverToSecondInstance("0.9.1", {}), false);
  assert.equal(shouldHandoverToSecondInstance("0.9.1", { version: "" }), false);
  assert.equal(shouldHandoverToSecondInstance("0.9.1", { version: 42 }), false);
  assert.equal(shouldHandoverToSecondInstance("0.9.1", "0.9.2"), false);
});
