import { describe, expect, it, vi } from "vitest";
import { draftProjectInstructions } from "./project-instructions.js";

describe("draftProjectInstructions", () => {
  it("returns the drafted instructions", async () => {
    const complete = vi.fn(async () => "  # Goal\nBoard deck  ");
    await expect(draftProjectInstructions(" Q3 deck ", "a1", "p1", { complete })).resolves.toBe("# Goal\nBoard deck");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1", sessionId: "chat-project-p1", prompt: "Q3 deck", maxTokens: 1024 }));
  });

  it("falls back to the raw purpose when completion returns null", async () => {
    await expect(draftProjectInstructions("Q3 deck", "", "p1", { complete: async () => null })).resolves.toBe("Q3 deck");
  });

  it("falls back to the raw purpose when completion throws", async () => {
    const complete = vi.fn(async () => { throw new Error("boom"); });
    await expect(draftProjectInstructions("Q3 deck", "", "p1", { complete })).resolves.toBe("Q3 deck");
  });

  it("skips the call for an empty purpose", async () => {
    const complete = vi.fn(async () => "x");
    await expect(draftProjectInstructions("   ", "", "p1", { complete })).resolves.toBe("");
    expect(complete).not.toHaveBeenCalled();
  });
});
