"use strict";

(function exposeChatUtils(root) {
  function hasVisibleAssistantContent(blocks) {
    return (blocks || []).some((block) =>
      block.type === "toolCall" ||
      block.type === "image" ||
      (block.type === "text" && Boolean(block.text?.trim())) ||
      (block.type === "thinking" && Boolean(block.thinking?.trim()))
    );
  }

  function isRetryAttemptError(message) {
    return message?.role === "assistant" && message.stopReason === "error" &&
      !hasVisibleAssistantContent(message.content || []);
  }

  /**
   * Pi persists retry attempts for audit history even after removing them from
   * its live context. Recovered attempts are hidden from the chat; if every
   * attempt failed, only the final error remains visible.
   */
  function collapseRetryAttempts(messages) {
    const output = [];
    let start = 0;
    for (let end = 1; end <= messages.length; end++) {
      if (end < messages.length && messages[end].role !== "user") continue;
      const segment = messages.slice(start, end);
      const lastAssistant = segment.findLast((message) => message.role === "assistant");
      const retryErrors = segment.filter(isRetryAttemptError);
      const finalRetryError = lastAssistant?.stopReason === "error" ? retryErrors.at(-1) : null;
      for (const message of segment) {
        if (!isRetryAttemptError(message) || message === finalRetryError) output.push(message);
      }
      start = end;
    }
    return output;
  }

  const api = { hasVisibleAssistantContent, isRetryAttemptError, collapseRetryAttempts };
  root.piChatUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
