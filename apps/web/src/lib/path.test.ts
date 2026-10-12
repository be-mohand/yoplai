import { describe, expect, it } from "vitest";
import { chatRouteSession } from "./path";

describe("chatRouteSession", () => {
  it("reads agent and session from a chat url", () => {
    expect(chatRouteSession("/chat/my%20agent", "?session=s1")).toEqual({ agentId: "my agent", sessionId: "s1" });
  });

  it("returns nothing for other routes or a missing session", () => {
    expect(chatRouteSession("/agents/x", "")).toEqual({ agentId: undefined, sessionId: undefined });
    expect(chatRouteSession("/chat/a", "")).toEqual({ agentId: "a", sessionId: undefined });
  });
});
