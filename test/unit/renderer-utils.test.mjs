"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const utils = require("../../src/renderer/lib/utils.js");
const {
  hasVisibleAssistantContent,
  isRawCommandOutputText,
  sanitizeAssistantBlocks,
  collapseRetryAttempts,
} = require("../../src/renderer/lib/chat-utils.js");

// ---- utils pure ----
test("utils: escapeHtml", () => {
  assert.equal(utils.escapeHtml('<a>"&\'</a>'), "&lt;a&gt;&quot;&amp;&#39;&lt;/a&gt;");
  assert.equal(utils.escapeHtml(null), "");
  assert.equal(utils.escapeHtml(0), "0");
});

test("utils: formatBytes", () => {
  assert.equal(utils.formatBytes(0), "0 B");
  assert.equal(utils.formatBytes(500), "500 B");
  assert.equal(utils.formatBytes(1023), "1023 B");
  assert.equal(utils.formatBytes(1024), "1 KB");
  assert.equal(utils.formatBytes(1536), "2 KB");
  assert.equal(utils.formatBytes(1048576), "1.0 MB");
  assert.equal(utils.formatBytes(1572864), "1.5 MB");
});

test("utils: fmtCost / fmtTokens", () => {
  assert.equal(utils.fmtCost(null), "");
  assert.equal(utils.fmtCost(0), "$0.0000");
  assert.equal(utils.fmtCost(0.0042), "$0.0042");
  assert.equal(utils.fmtCost(1.5), "$1.50");
  assert.equal(utils.fmtCost(12), "$12.00");
  assert.equal(utils.fmtTokens(null), "");
  assert.equal(utils.fmtTokens(0), "0");
  assert.equal(utils.fmtTokens(999), "999");
  assert.equal(utils.fmtTokens(1000), "1.0k");
  assert.equal(utils.fmtTokens(15600), "15.6k");
});

test("utils: basename / truncate", () => {
  assert.equal(utils.basename("/a/b/c.txt"), "c.txt");
  assert.equal(utils.basename("C:\\a\\b\\"), "b");
  assert.equal(utils.basename(""), "");
  assert.equal(utils.truncate("hello", 10), "hello");
  assert.equal(utils.truncate("hello world", 5), "hell…");
  assert.equal(utils.truncate(null, 5), "");
});

test("utils: clipboardImageExtension", () => {
  assert.equal(utils.clipboardImageExtension("image/png"), "png");
  assert.equal(utils.clipboardImageExtension("image/jpeg"), "jpg");
  assert.equal(utils.clipboardImageExtension("image/webp"), "webp");
  assert.equal(utils.clipboardImageExtension("image/svg+xml"), "png");
  assert.equal(utils.clipboardImageExtension(null), "png");
});

test("utils: parsedToolArgs / fullToolArgs / changedLineCounts", () => {
  assert.deepEqual(utils.parsedToolArgs({ a: 1 }), { a: 1 });
  assert.deepEqual(utils.parsedToolArgs('{"a":1}'), { a: 1 });
  assert.deepEqual(utils.parsedToolArgs("not-json"), { value: "not-json" });
  assert.deepEqual(utils.parsedToolArgs(null), {});
  assert.equal(utils.fullToolArgs({ a: 1 }), '{"a":1}');
  assert.equal(utils.fullToolArgs("hello"), "hello");
  const { added, removed } = utils.changedLineCounts({ oldText: "a\nb", newText: "a\nb\nc" });
  assert.equal(removed, 2);
  assert.equal(added, 3);
  const multi = utils.changedLineCounts({ edits: [{ oldText: "x", newText: "y\nz" }] });
  assert.equal(multi.removed, 1);
  assert.equal(multi.added, 2);
});

test("utils: compactProjectPath", () => {
  assert.equal(utils.compactProjectPath("/home/lorenzo/proj/src/a/b/c", "/home/lorenzo/proj"), "src/a/b/c");
  assert.equal(utils.compactProjectPath("/home/lorenzo/proj", "/home/lorenzo/proj"), ".");
  assert.equal(utils.compactProjectPath("/a/b/c/d/e", ""), "…/c/d/e");
  assert.equal(utils.compactProjectPath("a/b", ""), "a/b");
});

test("utils: stripAnsi", () => {
  assert.equal(utils.stripAnsi("\x1b[31mred\x1b[0m"), "red");
  assert.equal(utils.stripAnsi("plain"), "plain");
});

test("utils: relTime with injected now/t", () => {
  const now = Date.now();
  const t = (k, v) => (k === "time.minutes" ? `${v.n}m` : k === "time.hours" ? `${v.n}h` : k === "time.days" ? `${v.n}d` : k);
  assert.equal(utils.relTime(now - 10_000, now, t), "time.now");
  assert.equal(utils.relTime(now - 5 * 60000, now, t), "5m");
  assert.equal(utils.relTime(now - 3 * 3600000, now, t), "3h");
  assert.equal(utils.relTime(now - 2 * 86400000, now, t), "2d");
});

test("utils: bufferToBase64", () => {
  if (typeof Buffer !== "undefined") {
    assert.equal(utils.bufferToBase64(Buffer.from("hello")), Buffer.from("hello").toString("base64"));
    assert.equal(utils.bufferToBase64(new Uint8Array([104, 101, 108, 108, 111])), Buffer.from("hello").toString("base64"));
  }
});

// ---- chat-utils (regression lock) ----
test("chat-utils: collapseRetryAttempts hides intermediate errors", () => {
  const msgs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: [], stopReason: "error" },
    { role: "assistant", content: [], stopReason: "error" },
    { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop" },
  ];
  const collapsed = collapseRetryAttempts(msgs);
  assert.equal(collapsed.filter((m) => m.role === "assistant" && m.stopReason === "error").length, 0);
  // final error must stay visible
  const allFailed = [
    { role: "user", content: "hi" },
    { role: "assistant", content: [], stopReason: "error" },
    { role: "assistant", content: [], stopReason: "error" },
  ];
  assert.equal(collapseRetryAttempts(allFailed).length, 2); // user + last error
});

test("chat-utils: hasVisibleAssistantContent", () => {
  assert.equal(hasVisibleAssistantContent([{ type: "text", text: " " }]), false);
  assert.equal(hasVisibleAssistantContent([{ type: "text", text: "hi" }]), true);
  assert.equal(hasVisibleAssistantContent([{ type: "toolCall", id: "1" }]), true);
});

test("chat-utils: raw command transcripts are removed from assistant prose", () => {
  const raw = "INSTALL_EXIT:0\n\n/home/me/app.js\n15:10 error Empty block statement";
  assert.equal(isRawCommandOutputText(raw), true);
  assert.equal(isRawCommandOutputText("Il comando è terminato correttamente."), false);

  const tool = { type: "toolCall", id: "1", name: "bash" };
  const answer = { type: "text", text: "Ho corretto i problemi." };
  assert.deepEqual(sanitizeAssistantBlocks([tool, { type: "text", text: raw }, answer]), [tool, answer]);
  assert.deepEqual(sanitizeAssistantBlocks("invalid"), []);
});
