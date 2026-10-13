import { beforeEach, describe, expect, it, vi } from "vitest";

const { membership, get, addReference, appendNotes, constructors } = vi.hoisted(() => ({
  membership: vi.fn(), get: vi.fn(), addReference: vi.fn(), appendNotes: vi.fn(), constructors: vi.fn(),
}));
vi.mock("../history/store.js", () => ({ resolveSessionProject: membership }));
vi.mock("../config/index.js", () => ({ CONFIG_DIR: "/tmp/project-tools" }));
vi.mock("./store.js", () => ({
  ChatProjectStore: class {
    constructor(...args: unknown[]) { constructors(...args); }
    get = get;
    addReference = addReference;
    appendNotes = appendNotes;
  },
}));
import { executeProjectTool } from "./tools.js";

const context = { agentId: "sally", sessionId: "chat", userId: "alice", projectId: "research" };

describe("project memory tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membership.mockResolvedValue("research");
    get.mockResolvedValue({ id: "research" });
    addReference.mockResolvedValue({ id: "ref", title: "Wiki", description: "Useful section", path: "/private/wiki" });
  });

  it("does not append notes for an unknown tool name", async () => {
    await expect(executeProjectTool("unknown", { text: "Finding" }, context)).rejects.toThrow("Unknown tool: unknown");
    expect(appendNotes).not.toHaveBeenCalled();
    expect(membership).not.toHaveBeenCalled();
  });

  it("persists references in the run user's project without returning private paths", async () => {
    const args = { title: "Wiki", description: "Useful section", path: "/private/wiki", projectId: "other", userId: "bob" };
    expect(await executeProjectTool("project_references_add", args, context)).toEqual({ id: "ref", title: "Wiki", description: "Useful section" });
    expect(constructors).toHaveBeenCalledWith("/tmp/project-tools", "alice");
    expect(membership).toHaveBeenCalledWith("sally", "chat", "alice");
    expect(addReference).toHaveBeenCalledWith("research", { title: "Wiki", description: "Useful section", path: "/private/wiki" });
  });

  it("appends notes to the trusted run project", async () => {
    expect(await executeProjectTool("project_notes_append", { text: "Shared finding" }, context)).toEqual({ saved: true });
    expect(appendNotes).toHaveBeenCalledWith("research", "Shared finding");
  });

  it("refuses outside project chats even with forged project arguments", async () => {
    await expect(executeProjectTool("project_notes_append", { text: "Finding", projectId: "research" }, { ...context, projectId: undefined })).rejects.toThrow("only in project chats");
    expect(membership).not.toHaveBeenCalled();
    expect(appendNotes).not.toHaveBeenCalled();
  });

  it.each([null, "other"])("refuses a run whose chat membership changed to %s", async (projectId) => {
    membership.mockResolvedValue(projectId);
    await expect(executeProjectTool("project_notes_append", { text: "Finding" }, context)).rejects.toThrow("project changed");
    expect(appendNotes).not.toHaveBeenCalled();
  });

  it("refuses a project deleted during the run", async () => {
    get.mockResolvedValue(null);
    await expect(executeProjectTool("project_notes_append", { text: "Finding" }, context)).rejects.toThrow("Project not found");
    expect(appendNotes).not.toHaveBeenCalled();
  });

  it("rejects empty inputs without persisting", async () => {
    await expect(executeProjectTool("project_notes_append", { text: " " }, context)).rejects.toThrow();
    await expect(executeProjectTool("project_references_add", { title: "Wiki", description: " ", path: "/wiki" }, context)).rejects.toThrow();
    expect(appendNotes).not.toHaveBeenCalled();
    expect(addReference).not.toHaveBeenCalled();
  });
});
