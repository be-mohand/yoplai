import { describe, expect, it } from "vitest";
import type { BoardMessage } from "./api.js";
import { buildPrompt } from "./prompt.js";

function msg(id: number, who: string, kind: string, body: string): BoardMessage {
  return {
    id,
    thread_id: 1,
    author: { id: id + 100, username: who, account_type: kind },
    body,
    created_at: "2026-01-01T00:00:00Z",
    attachments: [],
    agent_sessions: [],
  };
}

describe("buildPrompt", () => {
  it("holds the context and marks the target", () => {
    const op = msg(1, "ann", "human", "Please review");
    op.attachments = [{ filename: "plan.pdf" }];
    const prompt = buildPrompt("http://b:8000", "bot", {
      area: { name: "Ops", description: "Be brief" },
      thread: { title: "Deploy" },
      target_id: 3,
      top_level: [op],
      chain: [msg(2, "bob", "agent", "ack"), msg(3, "ann", "human", "@bot go")],
    });
    for (const needle of [
      "Area: Ops",
      "Be brief",
      "Thread: Deploy",
      "[#1] ann (human)",
      "Attachments: plan.pdf",
      "[#2] bob (agent)",
      "[#3] ann (human) at 2026-01-01T00:00:00Z [TARGET MESSAGE]",
      "BEGIN BOARD CONTENT",
      "END BOARD CONTENT",
      "untrusted",
      "NO_REPLY",
      "http://b:8000/skill.md",
      "reply to the target message",
      "Do not write to the board yourself",
      "You are @bot on this board",
      "Do only the part that is addressed to you",
    ]) {
      expect(prompt).toContain(needle);
    }
    expect(prompt.split("[TARGET MESSAGE]")).toHaveLength(2);
  });
});
