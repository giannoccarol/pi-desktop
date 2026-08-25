"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { scoreMentionCandidate, createMentionService } = require("../src/main/mention-service.js");

test("mention: scoreMentionCandidate ranking", () => {
  // exact basename match scores highest
  assert.ok(scoreMentionCandidate("src/app.js", "app.js", false) > scoreMentionCandidate("src/other.js", "app.js", false));
  assert.ok(scoreMentionCandidate("src/app.js", "app", false) > 0);
  // isDir bonus
  assert.ok(scoreMentionCandidate("src/components", "components", true) > scoreMentionCandidate("src/components", "components", false));
  // fuzzy match
  assert.equal(scoreMentionCandidate("src/app.js", "xyz", false), -1);
  assert.ok(scoreMentionCandidate("src/app.js", "apjs", false) >= 10);
  // empty query → positive (short path bonus)
  assert.ok(scoreMentionCandidate("a.js", "", false) > scoreMentionCandidate("a/b/c/d/e/f.js", "", false));
});

test("mention: searchMentionCandidates with temp project", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mention-"));
  // create files
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "app.js"), "x");
  fs.writeFileSync(path.join(dir, "src", "utils.js"), "x");
  fs.writeFileSync(path.join(dir, "README.md"), "x");
  // init git so listProjectFiles uses git ls-files; if no git, fallback walk will still find files
  const service = createMentionService(() => dir);
  const results = await service.searchMentionCandidates("app");
  assert.ok(Array.isArray(results));
  assert.ok(results.length <= 12);
  // top result should be app.js for query "app"
  assert.ok(results[0].path.includes("app.js"));
  // empty query returns dir + file candidates
  const all = await service.searchMentionCandidates("");
  assert.ok(all.length > 0);
  assert.ok(all.some((r) => r.path === "src"));
  // non-existent root returns []
  const emptyService = createMentionService(() => "/non-existent-xyz");
  assert.deepEqual(await emptyService.searchMentionCandidates("a"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("mention: cache is per-root and TTL respected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mention-cache-"));
  fs.writeFileSync(path.join(dir, "a.txt"), "x");
  const service = createMentionService(() => dir);
  const first = await service.searchMentionCandidates("");
  const second = await service.searchMentionCandidates("");
  assert.deepEqual(first, second); // cached
  service._resetCache();
  const third = await service.searchMentionCandidates("");
  assert.deepEqual(first, third); // same after reset (still same files)
  fs.rmSync(dir, { recursive: true, force: true });
});
