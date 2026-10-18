import { describe, expect, it, vi } from "vitest";
import { dispatchWsEvent } from "./ws";

describe("nested tool dispatch", () => {
  it("carries parent ids through tool callbacks and reconnect snapshots", () => {
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();
    const onActiveTurn = vi.fn();
    const callbacks = { onToolCall, onToolResult, onActiveTurn };
    dispatchWsEvent({ type: "tool_call", id: "code/0", name: "lookup", arguments: { id: 7 }, parentToolCallId: "code" }, callbacks);
    dispatchWsEvent({ type: "tool_result", id: "code/0", name: "lookup", content: "found", parentToolCallId: "code" }, callbacks);
    const snapshot = { userText: "batch", userTimestamp: 1, startedAt: 2, thinking: "", text: "", toolCalls: [{ id: "code/0", name: "lookup", arguments: { id: 7 }, status: "done" as const, parentToolCallId: "code" }], toolResults: [{ id: "code/0", name: "lookup", parentToolCallId: "code", content: "completed before reconnect", isError: false }] };
    dispatchWsEvent({ type: "active_turn", agentId: "agent", sessionId: "session", ...snapshot }, callbacks);

    expect(onToolCall).toHaveBeenCalledWith("code/0", "lookup", { id: 7 }, "code");
    expect(onToolResult).toHaveBeenCalledWith("code/0", "lookup", "found", false, undefined, "code");
    expect(onActiveTurn).toHaveBeenCalledWith(snapshot);
  });
});

describe("terminal failure dispatch", () => {
  it("dispatches safe user text rather than raw provider errors", () => {
    const onError = vi.fn();
    dispatchWsEvent({ type: "error", message: "provider secret request-id", kind: "rate_limit", userMessage: "Safe notice" }, { onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Safe notice");
  });

  it("uses a safe fixed message for legacy error events", () => {
    const onError = vi.fn();
    dispatchWsEvent({ type: "error", message: "provider secret request-id" }, { onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Something went wrong, please try again.");
  });
});
