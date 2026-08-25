import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const mainSource = fs.readFileSync(path.join(root, "src/main/core/main.js"), "utf8");
const mainDir = path.join(root, "src/main/core");

test("main paths: renderer and preload resolve to existing files", () => {
  const rendererHtml = path.join(mainDir, "..", "..", "renderer", "index.html");
  const preloadJs = path.join(mainDir, "..", "..", "preload", "preload.js");
  assert.ok(fs.existsSync(rendererHtml), `missing ${rendererHtml}`);
  assert.ok(fs.existsSync(preloadJs), `missing ${preloadJs}`);
  assert.match(mainSource, /loadFile\(path\.join\(__dirname, "\.\.", "\.\.", "renderer", "index\.html"\)\)/);
  assert.match(mainSource, /preload: path\.join\(__dirname, "\.\.", "\.\.", "preload", "preload\.js"\)/);
});

test("window icon: packaged Linux fallback includes the installed 1024px icon", () => {
  assert.match(mainSource, /hicolor\/1024x1024\/apps\/pi-desktop\.png/);
  assert.match(mainSource, /icon:\s*windowIcon/);
});
