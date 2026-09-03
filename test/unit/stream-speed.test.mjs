import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const utils = require("../../src/renderer/lib/utils.js");

test("speedMeta: secondi + tok/s", () => {
  assert.deepEqual(utils.speedMeta({ output: 3240 }, 0, 2700), ["2.7s", "1200.0 tok/s"]);
});

test("speedMeta: senza usage solo i secondi", () => {
  assert.deepEqual(utils.speedMeta(null, 0, 2700), ["2.7s"]);
  assert.deepEqual(utils.speedMeta({}, 0, 0), ["0.0s"]);
});

test("speedMeta: fallback totalTokens e input non validi", () => {
  assert.deepEqual(utils.speedMeta({ totalTokens: 100 }, 0, 2000), ["2.0s", "50.0 tok/s"]);
  assert.deepEqual(utils.speedMeta({ output: 10 }, NaN, 1000), []);
});
