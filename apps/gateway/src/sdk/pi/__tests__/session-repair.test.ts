import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { repairOrphanedToolCalls } from "../session-repair.js";

type ToolResultMessage = AgentMessage & {
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

/**
 * Real in-memory Pi session: messages are seeded through SessionManager and
 * the agent state is the provider projection, refreshed the way AgentSession
 * refreshes it.
 */
function makeSession(messages: AgentMessage[]) {
  const sessionManager = SessionManager.inMemory(process.cwd());
  for (const message of messages) {
    sessionManager.appendMessage(
      message as Parameters<typeof sessionManager.appendMessage>[0]
    );
  }
  const state = { messages: sessionManager.buildSessionProjection().messages };
  const refreshContext = vi.fn(() => {
    state.messages = sessionManager.buildSessionProjection().messages;
  });
  return { agent: { state }, sessionManager, refreshContext };
}

function context(session: ReturnType<typeof makeSession>) {
  return session.sessionManager.buildSessionProjection().messages;
}

function expectUnchanged(session: ReturnType<typeof makeSession>, length: number) {
  expect(context(session)).toHaveLength(length);
  expect(session.agent.state.messages).toEqual(context(session));
  expect(session.refreshContext).not.toHaveBeenCalled();
}

describe("repairOrphanedToolCalls", () => {
  it("no-ops on empty session", () => {
    const session = makeSession([]);
    repairOrphanedToolCalls(session);
    expectUnchanged(session, 0);
  });

  it("no-ops when session has only user messages", () => {
    const session = makeSession([
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
        timestamp: 1,
      } as AgentMessage,
    ]);
    repairOrphanedToolCalls(session);
    expectUnchanged(session, 1);
  });

  it("no-ops when last assistant has stopReason endTurn", () => {
    const session = makeSession([
      { role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 } as AgentMessage,
      {
        role: "assistant",
        stopReason: "endTurn",
        content: [{ type: "text", text: "Hello!" }],
        timestamp: 2,
      } as unknown as AgentMessage,
    ]);
    repairOrphanedToolCalls(session);
    expectUnchanged(session, 2);
  });

  it("no-ops when toolResult already present after toolUse", () => {
    const session = makeSession([
      {
        role: "assistant",
        stopReason: "toolUse",
        content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }],
        timestamp: 1,
      } as unknown as AgentMessage,
      {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "bash",
        content: [{ type: "text", text: "output" }],
        isError: false,
        timestamp: 2,
      } as AgentMessage,
    ]);
    repairOrphanedToolCalls(session);
    expectUnchanged(session, 2);
  });

  it("repairs single orphaned tool call in the provider context", () => {
    const session = makeSession([
      {
        role: "user",
        content: [{ type: "text", text: "run it" }],
        timestamp: 1,
      } as AgentMessage,
      {
        role: "assistant",
        stopReason: "toolUse",
        content: [{ type: "toolCall", id: "tc_abc", name: "bash", arguments: {} }],
        timestamp: 2,
      } as unknown as AgentMessage,
    ]);
    repairOrphanedToolCalls(session);

    const result = context(session);
    expect(result.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
    ]);
    const repaired = result[2] as ToolResultMessage;
    expect(repaired.toolCallId).toBe("tc_abc");
    expect(repaired.toolName).toBe("bash");
    expect(repaired.isError).toBe(true);
    expect(repaired.content?.[0]?.text).toBe(
      "[Session interrupted — tool result unavailable. The gateway was restarted while this tool call was pending.]"
    );
    expect(session.refreshContext).toHaveBeenCalledTimes(1);
    expect(session.agent.state.messages).toEqual(result);
  });

  it("repairs multiple orphaned tool calls in the provider context", () => {
    const session = makeSession([
      {
        role: "assistant",
        stopReason: "toolUse",
        content: [
          { type: "toolCall", id: "tc1", name: "bash", arguments: {} },
          { type: "toolCall", id: "tc2", name: "read", arguments: {} },
        ],
        timestamp: 1,
      } as unknown as AgentMessage,
    ]);
    repairOrphanedToolCalls(session);

    const result = context(session) as ToolResultMessage[];
    expect(result).toHaveLength(3);
    expect(result.slice(1).map((m) => [m.role, m.toolCallId, m.toolName, m.isError])).toEqual([
      ["toolResult", "tc1", "bash", true],
      ["toolResult", "tc2", "read", true],
    ]);
    expect(session.agent.state.messages).toEqual(result);
  });

  it("repairs canonical provider context when a later user message exists", () => {
    const manager = SessionManager.inMemory(process.cwd());
    manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "run it" }],
      timestamp: 1,
    });
    manager.appendMessage({
      role: "assistant",
      stopReason: "toolUse",
      content: [
        { type: "toolCall", id: "tc_abc", name: "bash", arguments: {} },
      ],
      timestamp: 2,
    } as Parameters<typeof manager.appendMessage>[0]);
    manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "and then?" }],
      timestamp: 3,
    });
    const state = { messages: manager.buildSessionProjection().messages };
    const refreshContext = () => {
      state.messages = manager.buildSessionProjection().messages;
    };

    repairOrphanedToolCalls({
      agent: { state },
      sessionManager: manager,
      refreshContext,
    });

    const context = manager.buildSessionProjection().messages;
    expect(typeof (context[2] as { timestamp?: number }).timestamp).toBe("number");
    expect(context.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "user",
    ]);
    expect((context[2] as ToolResultMessage).toolCallId).toBe("tc_abc");
    expect(
      (context[3] as { content: Array<{ text: string }> }).content[0].text
    ).toBe("and then?");
    expect(state.messages).toEqual(context);
  });

  it("fails closed if canonical edits after the orphan cannot be replayed", () => {
    const manager = SessionManager.inMemory(process.cwd());
    const firstUserId = manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "run it" }],
      timestamp: 1,
    });
    manager.appendMessage({
      role: "assistant",
      stopReason: "toolUse",
      content: [
        { type: "toolCall", id: "tc_abc", name: "bash", arguments: {} },
      ],
      timestamp: 2,
    } as Parameters<typeof manager.appendMessage>[0]);
    manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "and then?" }],
      timestamp: 3,
    });
    manager.appendContextEdit(firstUserId, {
      content: [{ type: "text", text: "edited instruction" }],
    });
    const state = { messages: manager.buildSessionProjection().messages };
    const leafBefore = manager.getLeafId();
    const refreshContext = vi.fn();

    expect(() =>
      repairOrphanedToolCalls({ agent: { state }, sessionManager: manager, refreshContext })
    ).toThrow("Cannot repair orphaned tool calls in canonical session context");
    expect(manager.getLeafId()).toBe(leafBefore);
    expect(manager.buildSessionProjection().messages).toEqual(state.messages);
    expect(refreshContext).not.toHaveBeenCalled();
  });

  it("no-ops when toolUse has no toolCall blocks", () => {
    const session = makeSession([
      {
        role: "assistant",
        stopReason: "toolUse",
        content: [{ type: "text", text: "thinking..." }],
        timestamp: 1,
      } as unknown as AgentMessage,
    ]);
    repairOrphanedToolCalls(session);
    expectUnchanged(session, 1);
  });
});
