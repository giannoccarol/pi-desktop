import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const styles = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

test("typography: Inter is the UI font and monospace is reserved for technical content", () => {
  assert.match(styles, /font:\s*14px\/1\.5\s+"Inter"/);
  assert.match(styles, /--mono:\s*ui-monospace/);
});

test("typography: readable text never drops below 10px", () => {
  const undersized = [...styles.matchAll(/font-size:\s*([\d.]+)px/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size > 0 && size < 10);
  assert.deepEqual(undersized, []);
});
