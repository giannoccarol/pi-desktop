"use strict";

// Keep renderer-bound payloads clone-safe. Chromium IPC structured clone
// throws RangeError: Maximum call stack size exceeded on large strings /
// deep trees (inlined screenshots, 300+ message transcripts).
const MAX_IMAGE_CHARS = 100_000;
const MAX_TEXT_CHARS = 24_000;
const MAX_DEPTH = 40;
const MAX_MESSAGES = 100;
const MAX_SERIALIZED_CHARS = 600_000;

function looksLikeBase64(value) {
  if (typeof value !== "string" || value.length < 32) return false;
  const sample = value.slice(0, 80).replace(/\s/g, "");
  return /^[A-Za-z0-9+/=]+$/.test(sample);
}

function sanitizeForIpc(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_DEPTH) return "[Deep]";
  if (typeof value === "string") {
    if (value.length <= MAX_TEXT_CHARS) return value;
    return `${value.slice(0, MAX_TEXT_CHARS)}\n… [${value.length} bytes]`;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForIpc(item, depth + 1, seen));
  if (value.type === "image" && typeof value.data === "string" && value.data.length > MAX_IMAGE_CHARS) {
    return {
      type: "image",
      mimeType: value.mimeType || value.media_type || "",
      omitted: true,
      byteLength: value.data.length,
    };
  }
  if (typeof value.data === "string" && value.data.length > MAX_IMAGE_CHARS && looksLikeBase64(value.data)) {
    const out = { omitted: true, byteLength: value.data.length };
    for (const [key, nested] of Object.entries(value)) {
      if (key === "data") continue;
      out[key] = sanitizeForIpc(nested, depth + 1, seen);
    }
    return out;
  }
  const out = {};
  for (const [key, nested] of Object.entries(value)) out[key] = sanitizeForIpc(nested, depth + 1, seen);
  return out;
}

function sliceTailMessages(messages, max) {
  if (!Array.isArray(messages) || messages.length <= max) {
    return { messages: Array.isArray(messages) ? messages : [], hiddenCount: 0 };
  }
  let start = messages.length - max;
  while (start > 0 && start < messages.length && messages[start]?.role !== "user") start += 1;
  if (start >= messages.length) start = Math.max(0, messages.length - max);
  return { messages: messages.slice(start), hiddenCount: start };
}

function capSerializedSize(messages, hiddenCount, maxBytes = MAX_SERIALIZED_CHARS) {
  let list = messages;
  let hidden = hiddenCount;
  for (let guard = 0; guard < 12 && list.length > 8; guard += 1) {
    let size = 0;
    try { size = JSON.stringify(list).length; } catch { size = maxBytes + 1; }
    if (size <= maxBytes) break;
    const drop = Math.max(4, Math.ceil(list.length * 0.25));
    hidden += drop;
    list = list.slice(drop);
    let snap = 0;
    while (snap < list.length && list[snap]?.role !== "user") snap += 1;
    if (snap > 0 && snap < list.length) {
      hidden += snap;
      list = list.slice(snap);
    }
  }
  return { messages: list, hiddenCount: hidden };
}

function sanitizeMessagesPayload(payload, maxMessages = MAX_MESSAGES, maxBytes = MAX_SERIALIZED_CHARS) {
  const root = sanitizeForIpc(payload);
  const raw = Array.isArray(root?.messages) ? root.messages : Array.isArray(root) ? root : [];
  const sliced = sliceTailMessages(raw, maxMessages);
  const capped = capSerializedSize(sliced.messages, sliced.hiddenCount, maxBytes);
  const base = root && !Array.isArray(root) ? root : {};
  return {
    ...base,
    messages: capped.messages,
    truncated: capped.hiddenCount > 0,
    hiddenCount: capped.hiddenCount,
  };
}

module.exports = {
  sanitizeForIpc,
  sanitizeMessagesPayload,
  sliceTailMessages,
  MAX_IMAGE_CHARS,
  MAX_TEXT_CHARS,
  MAX_MESSAGES,
  MAX_SERIALIZED_CHARS,
};
