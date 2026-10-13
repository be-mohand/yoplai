// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const { navigate, fetchProject, saveInstructions, startNewChat, fetchFiles, uploadFile, deleteFile } = vi.hoisted(() => ({
  navigate: vi.fn(), fetchProject: vi.fn(), saveInstructions: vi.fn(), startNewChat: vi.fn(), fetchFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(),
}));
vi.mock("@solidjs/router", () => ({
  A: (props: Record<string, unknown>) => <a {...props} />,
  useParams: () => ({ id: "project-1" }),
  useNavigate: () => navigate,
}));
vi.mock("../api", () => ({
  fetchAgentSessions: vi.fn(async () => ({ items: [] })),
  fetchAgents: vi.fn(async () => [{ id: "agent-1", name: "Writer" }, { id: "agent-2", name: "Researcher" }]),
  startNewChat,
}));
vi.mock("../api/chat-projects", () => ({
  fetchChatProjectFiles: fetchFiles,
  uploadChatProjectFile: uploadFile, deleteChatProjectFile: deleteFile,
  fetchChatProject: fetchProject,
  updateChatProjectInstructions: saveInstructions,
  renameChatProject: vi.fn(), deleteChatProject: vi.fn(),
}));
import { ChatProject } from "./ChatProject";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let dispose: (() => void) | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  fetchFiles.mockResolvedValue({ items: [] });
  uploadFile.mockResolvedValue(undefined); deleteFile.mockResolvedValue(undefined);
  fetchProject.mockResolvedValue({ id: "project-1", name: "Writing", instructions: "Be concise." });
  saveInstructions.mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  dispose = render(() => <ChatProject />, container);
});
afterEach(() => { dispose?.(); container.remove(); });

describe("ChatProject", () => {
  it("requires an explicit accessible agent choice and starts a fresh project chat", async () => {
    await tick();
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "New chat")?.click();
    await tick();
    const select = container.querySelector("select")!;
    const start = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Start chat")!;
    expect(select.value).toBe("");
    expect(start.disabled).toBe(true);
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Select an agent", "Writer", "Researcher"]);
    select.value = "agent-2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    start.click();
    expect(startNewChat).toHaveBeenCalledWith("agent-2");
    expect(navigate).toHaveBeenCalledWith("/chat/agent-2?project=project-1");
  });

  it("uploads and deletes files, displaying upload failures without blocking chat", async () => {
    await tick();
    fetchFiles.mockResolvedValue({ items: [{ id: "file-1", name: "notes.txt", size: 5 }] });
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    const file = new File(["Notes"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(uploadFile).toHaveBeenCalledWith("project-1", file);
    expect(container.textContent).toContain("notes.txt");
    fetchFiles.mockResolvedValue({ items: [] });
    container.querySelector<HTMLButtonElement>('button[aria-label="Delete notes.txt"]')!.click();
    await tick();
    expect(deleteFile).toHaveBeenCalledWith("project-1", "file-1");
    expect(container.textContent).not.toContain("notes.txt");
    uploadFile.mockRejectedValueOnce(new Error("Upload timed out"));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(container.querySelector("[role=alert]")?.textContent).toBe("Upload timed out");
    expect(input.disabled).toBe(false);
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "New chat")?.disabled).toBe(false);
  });

  it("loads and saves project instructions and reports save failures", async () => {
    await tick();
    const textarea = container.querySelector("textarea")!;
    expect(textarea.value).toBe("Be concise.");
    textarea.value = "Cite useful sources.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(saveInstructions).toHaveBeenCalledWith("project-1", "Cite useful sources.");
    saveInstructions.mockRejectedValueOnce(new Error("Unavailable"));
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Unable to save instructions");
    expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false);
  });
});
