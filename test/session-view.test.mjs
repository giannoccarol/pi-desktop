import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname,"..");

test("session-view extracted: app.js delegates to piSessionView",()=>{
  const app=fs.readFileSync(path.join(root,"src/renderer/session-view.js"),"utf8");
  assert.match(app,/function getCachedSessionMessages/);
  assert.match(app,/function openHistorySession/);
  const main=fs.readFileSync(path.join(root,"src/renderer/app.js"),"utf8");
  assert.match(main,/piSessionView/);
  const html=fs.readFileSync(path.join(root,"src/renderer/index.html"),"utf8");
  assert.ok(html.indexOf("session-view.js")>html.indexOf("session.js"));
});
