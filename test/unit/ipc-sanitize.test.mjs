"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sanitizeForIpc,
  sanitizeMessagesPayload,
  sliceTailMessages,
  MAX_TEXT_CHARS,
  MAX_IMAGE_CHARS,
  MAX_MESSAGES,
} = require("../../src/main/services/ipc-sanitize.js");

test("ipc-sanitize: circular objects do not overflow", () => {
  const a = { role: "user", content: "ciao" };
  a.self = a;
  const out = sanitizeForIpc(a);
  assert.equal(out.role, "user");
  assert.equal(out.self, "[Circular]");
  structuredClone(out);
});

test("ipc-sanitize: long strings and images are truncated", () => {
  const text = "x".repeat(MAX_TEXT_CHARS + 80);
  const image = { type: "image", mimeType: "image/png", data: "A".repeat(MAX_IMAGE_CHARS + 50) };
  const out = sanitizeForIpc({ text, image });
  assert.ok(out.text.length < text.length);
  assert.match(out.text, /bytes\]$/);
  assert.equal(out.image.omitted, true);
  assert.equal(out.image.data, undefined);
  assert.equal(out.image.byteLength, image.data.length);
  structuredClone(out);
});

test("ipc-sanitize: long transcripts keep a clone-safe tail", () => {
  const messages = [];
  for (let i = 0; i < MAX_MESSAGES + 40; i++) {
    messages.push({ role: i % 3 === 0 ? "user" : "assistant", content: `m${i}:${"n".repeat(200)}` });
  }
  const payload = sanitizeMessagesPayload({ messages, extra: true });
  assert.equal(payload.truncated, true);
  assert.ok(payload.hiddenCount > 0);
  assert.ok(payload.messages.length <= MAX_MESSAGES);
  assert.equal(payload.messages[0].role, "user");
  structuredClone(payload);
});

test("ipc-sanitize: sliceTailMessages snaps to a user turn", () => {
  const messages = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
    { role: "assistant", content: "d" },
    { role: "toolResult", content: "e" },
  ];
  const sliced = sliceTailMessages(messages, 3);
  assert.equal(sliced.messages[0].role, "user");
  assert.equal(sliced.messages[0].content, "c");
  assert.equal(sliced.hiddenCount, 2);
});
