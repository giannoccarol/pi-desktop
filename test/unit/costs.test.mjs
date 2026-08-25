import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const costs = require("../../src/renderer/features/costs.js");

test("costs: aggregateCostsByProject sums tokens and cost per cwd", () => {
  const sessions = [
    { cwd: "/a", cost: 1.5, tokens: { total: 100 } },
    { cwd: "/a", cost: 2, tokens: { total: 200 } },
    { cwd: "/b", cost: 0.5, tokens: 50 },
    { cwd: null, cost: 99 },
  ];
  const map = costs.aggregateCostsByProject(sessions, null);
  assert.equal(map.get("/a").count, 2);
  assert.equal(map.get("/a").cost, 3.5);
  assert.equal(map.get("/a").tokens, 300);
  assert.equal(map.get("/b").count, 1);
  assert.equal(map.get("/b").tokens, 50);
});

test("costs: getProjectCosts returns zero for unknown", () => {
  const res = costs.getProjectCosts("/unknown", [], null);
  assert.deepEqual(res, { count: 0, cost: 0, tokens: 0 });
});

test("costs: formatProjectCost builds string", () => {
  const s = costs.formatProjectCost({ count: 2, cost: 1.23, tokens: 1234 }, (k)=>k);
  assert.match(s, /2 chat/);
  assert.match(s, /tok/);
});
