// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const { navigate, fetchProject, saveInstructions, startNewChat, fetchFiles, uploadFile, deleteFile, fetchReferences, deleteReference, fetchNotes, saveNotes } = vi.hoisted(() => ({
  navigate: vi.fn(), fetchProject: vi.fn(), saveInstructions: vi.fn(), startNewChat: vi.fn(), fetchFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(),
  fetchReferences: vi.fn(), deleteReference: vi.fn(), fetchNotes: vi.fn(), saveNotes: vi.fn(),
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
  fetchChatProjectReferences: fetchReferences, deleteChatProjectReference: deleteReference,
  fetchChatProjectNotes: fetchNotes, updateChatProjectNotes: saveNotes,
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
  fetchReferences.mockResolvedValue({ items: [] }); deleteReference.mockResolvedValue({});
  fetchNotes.mockResolvedValue({ text: "- Shared project learning" }); saveNotes.mockResolvedValue({ text: "" });
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
  it("renders only reference titles and descriptions and removes references", async () => {
    fetchReferences.mockResolvedValue({ items: [{ id: "ref-1", title: "Wiki section", description: "Useful background", path: "/private/wiki/section.md" }] });
    window.dispatchEvent(new Event("chat-projects-changed"));
    dispose?.(); dispose = render(() => <ChatProject />, container);
    await tick();
    const section = container.querySelector('[aria-label="Project references"]')!;
    expect(section.textContent).toContain("Wiki section");
    expect(section.textContent).toContain("Useful background");
    expect(container.innerHTML).not.toContain("/private/wiki/section.md");
    fetchReferences.mockResolvedValue({ items: [] });
    section.querySelector<HTMLButtonElement>('button[aria-label="Remove reference Wiki section"]')!.click();
    await tick();
    expect(deleteReference).toHaveBeenCalledWith("project-1", "ref-1");
    expect(section.textContent).not.toContain("Wiki section");
  });

  it("edits notes and preserves the draft after a timed out save", async () => {
    await tick();
    container.querySelector<HTMLButtonElement>("#project-notes-tab")!.click();
    const textarea = container.querySelector<HTMLTextAreaElement>("#project-notes")!;
    expect(textarea.value).toBe("- Shared project learning");
    textarea.value = "- Another agent can use this";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    fetchNotes.mockResolvedValue({ text: textarea.value });
    const form = textarea.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(saveNotes).toHaveBeenCalledWith("project-1", "- Another agent can use this");
    saveNotes.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Unable to save notes");
    expect(textarea.value).toBe("- Another agent can use this");
    expect(form.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "New chat")?.disabled).toBe(false);
  });

  it("keeps project actions available after reference removal fails", async () => {
    fetchReferences.mockResolvedValue({ items: [{ id: "ref-1", title: "Wiki", description: "Context" }] });
    dispose?.(); dispose = render(() => <ChatProject />, container);
    await tick();
    deleteReference.mockRejectedValueOnce(new Error("Unavailable"));
    container.querySelector<HTMLButtonElement>('button[aria-label="Remove reference Wiki"]')!.click();
    await tick();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Unable to remove reference");
    expect(container.textContent).toContain("Context");
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "New chat")?.disabled).toBe(false);
  });

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
