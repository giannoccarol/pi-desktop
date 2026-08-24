"use strict";
/**
 * Mock of `pi --mode rpc` used by automated tests.
 * Implements enough of docs/rpc.md to exercise a real client end-to-end,
 * including the U+2028/U+2029 framing pitfall documented by pi.
 */
const readline = require("readline");

const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  let cmd;
  try {
    cmd = JSON.parse(line);
  } catch {
    out({ type: "response", command: "parse", success: false, error: "bad json" });
    return;
  }
  const reply = (data) => out({ id: cmd.id, type: "response", command: cmd.type, success: true, data });

  switch (cmd.type) {
    case "get_state":
      reply({
        model: { provider: "mock", id: "mock-pro", name: "Mock Pro" },
        thinkingLevel: "medium",
        isStreaming: false,
        sessionFile: "/tmp/mock-session.jsonl",
        sessionId: "abc123",
        messageCount: 0,
      });
      break;
    case "get_messages":
      reply({
        messages: [
          { role: "user", content: "Ciao \u2028 pi\u2029!", timestamp: 1 },
          {
            role: "assistant",
            content: [{ type: "text", text: "Salve!" }],
            provider: "mock",
            model: "mock-pro",
            stopReason: "stop",
            usage: {},
            timestamp: 2,
          },
          { role: "toolResult", toolCallId: "call_1", toolName: "bash", content: [{ type: "text", text: "ok" }], isError: false },
        ],
      });
      break;
    case "get_available_models":
      reply({
        models: [
          { provider: "mock", id: "mock-pro", name: "Mock Pro", reasoning: true, contextWindow: 200000 },
          { provider: "other", id: "other-mini", name: "Other Mini", reasoning: false, contextWindow: 128000 },
        ],
      });
      break;
    case "set_model":
      if (!cmd.provider || !cmd.modelId) {
        out({ id: cmd.id, type: "response", command: "set_model", success: false, error: "missing fields" });
        break;
      }
      reply({ provider: cmd.provider, id: cmd.modelId });
      break;
    case "get_available_thinking_levels":
      reply({ levels: ["off", "minimal", "high"] });
      break;
    case "get_commands":
      reply({ commands: [
        { name: "model", description: "Select model", source: "builtin" },
        { name: "review", description: "Review changes", source: "extension" },
      ] });
      break;
    case "get_tree":
      reply({ entries: [{ id: "m1", parentId: null, type: "message", label: "Ciao" }], leafId: "m1" });
      break;
    case "get_entries":
      reply({ entries: [{ id: "m1", parentId: null, type: "message" }] });
      break;
    case "get_fork_messages":
      reply({ messages: [{ entryId: "m1", text: "Ciao" }] });
      break;
    case "get_last_assistant_text":
      reply({ text: "Salve!" });
      break;
    case "fork":
      reply({ leafId: cmd.entryId });
      break;
    case "clone":
      reply({ sessionFile: "/tmp/cloned.jsonl" });
      break;
    case "compact":
      reply({ summary: "compact" });
      break;
    case "export_html":
      reply({ outputPath: cmd.outputPath || "/tmp/export.html" });
      break;
    case "bash":
      reply({ output: "ok", exitCode: 0 });
      break;
    case "set_session_name":
    case "set_auto_compaction":
    case "set_auto_retry":
    case "abort_retry":
    case "set_steering_mode":
    case "set_follow_up_mode":
    case "abort_bash":
      reply(undefined);
      break;
    case "switch_session":
      reply({ cancelled: false });
      break;
    case "new_session":
      reply({ cancelled: false });
      break;
    case "prompt": {
      reply(undefined);
      const sep = "\u2028LINE-SEP\u2029";
      stream([
        { type: "agent_start" },
        { type: "message_start", message: { role: "assistant", content: [], provider: "mock", model: "mock-pro" } },
        { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: `ciao${sep} mondo` } },
        { type: "message_update", assistantMessageEvent: { type: "text_end", contentIndex: 0, content: `ciao${sep} mondo` } },
        { type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 1, id: "call_1", toolName: "bash" } },
        { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: 1, delta: "{\"command\":\"ls" } },
        { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: 1, delta: "\"}" } },
        { type: "tool_execution_start", toolCallId: "call_1", toolName: "bash", args: { command: "ls" } },
        { type: "message_end", message: { role: "assistant", content: [
            { type: "text", text: `ciao${sep} mondo` },
            { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } },
          ], stopReason: "toolUse", provider: "mock", model: "mock-pro", usage: {} } },
        { type: "turn_end", message: {}, toolResults: [] },
        { type: "agent_settled" },
      ]);
      break;
    }
    case "steer":
    case "follow_up":
    case "abort":
      reply(undefined);
      break;
    default:
      out({ id: cmd.id, type: "response", command: cmd.type || "?", success: true });
  }
});

function stream(events) {
  let i = 0;
  const tick = () => {
    if (i >= events.length) return;
    out(events[i++]);
    setTimeout(tick, 5);
  };
  tick();
}
