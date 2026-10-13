import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAgentContext } from "@yoplai/shared";

const { resolveSessionProject, get } = vi.hoisted(() => ({ resolveSessionProject: vi.fn(), get: vi.fn() }));
vi.mock("../history/store.js", () => ({ resolveSessionProject }));
vi.mock("../config/index.js", () => ({ CONFIG_DIR: "/tmp/context-test" }));
vi.mock("./store.js", () => ({
  isSafeChatProjectId: (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id),
  ChatProjectStore: class { get = get; },
}));
import { ProjectContextResolver } from "./context-resolver.js";

describe("ProjectContextResolver", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("omits project context outside a project", async () => {
    resolveSessionProject.mockResolvedValue(null);
    expect(await new ProjectContextResolver().resolve({ agentId: "alpha", sessionId: "chat" })).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });
  it("resolves membership and edited instructions each turn, including moved chats", async () => {
    const resolver = new ProjectContextResolver();
    resolveSessionProject.mockResolvedValue("research");
    get.mockResolvedValue({ instructions: "Use primary sources." });
    const context = await resolver.resolve({ agentId: "alpha", sessionId: "chat", userId: "alice", context: { kind: "web", name: "Alice" } });
    const text = renderAgentContext(context!);
    expect(text).toContain("Use primary sources.");
    expect(text).toContain("from the project instructions, files and notes, look for additional useful wiki sources and propose adding them as project references");
    expect(text.match(/\[PROJECT CONTEXT\]/g)).toHaveLength(1);
    expect(text).not.toContain("research");
    resolveSessionProject.mockResolvedValue("work");
    get.mockResolvedValue({ instructions: "Be concise." });
    expect(await resolver.resolve({ agentId: "alpha", sessionId: "chat" })).toMatchObject({ project: { instructions: "Be concise." } });
    resolveSessionProject.mockResolvedValue(null);
    expect(await resolver.resolve({ agentId: "alpha", sessionId: "chat" })).toBeUndefined();
  });
  it("ignores a stale project hint after a move or removal", async () => {
    resolveSessionProject.mockResolvedValue("work");
    get.mockImplementation(async (id) => id === "work" ? { instructions: "Current instructions." } : null);
    expect(await new ProjectContextResolver().resolve({ agentId: "alpha", sessionId: "chat", projectId: "deleted" })).toMatchObject({ project: { instructions: "Current instructions." } });
    expect(get).not.toHaveBeenCalledWith("deleted");
    resolveSessionProject.mockResolvedValue(null);
    expect(await new ProjectContextResolver().resolve({ agentId: "alpha", sessionId: "chat", projectId: "deleted" })).toBeUndefined();
  });
  it("omits deleted projects and rejects inaccessible initial projects", async () => {
    resolveSessionProject.mockResolvedValue("research");
    get.mockResolvedValue(null);
    expect(await new ProjectContextResolver().resolve({ agentId: "alpha", sessionId: "chat" })).toBeUndefined();
    resolveSessionProject.mockImplementation(async (_agent, _session, _user, projectId, validate) => {
      await validate(projectId);
      return projectId;
    });
    await expect(new ProjectContextResolver().resolve({ agentId: "alpha", sessionId: "new", projectId: "research" })).rejects.toThrow("Project not found");
  });
});
