// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const { navigate, fetchProject, saveInstructions, startNewChat, fetchFiles, uploadFile, deleteFile, fetchReferences, deleteReference, fetchNotes, saveNotes, renameProject } = vi.hoisted(() => ({
  navigate: vi.fn(), fetchProject: vi.fn(), saveInstructions: vi.fn(), startNewChat: vi.fn(), fetchFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(),
  fetchReferences: vi.fn(), deleteReference: vi.fn(), fetchNotes: vi.fn(), saveNotes: vi.fn(), renameProject: vi.fn(),
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
  renameChatProject: renameProject, deleteChatProject: vi.fn(),
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
  it("swaps title to input on click and saves on Enter", async () => {
    await tick();
    renameProject.mockResolvedValue({});
    container.querySelector<HTMLElement>(".project-title-button")!.click();
    await tick();
    const input = container.querySelector<HTMLInputElement>("input.project-title-input")!;
    expect(input.value).toBe("Writing");
    input.value = "Essays";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick();
    expect(renameProject).toHaveBeenCalledWith("project-1", "Essays");
  });

  it("cancels title edit on Escape", async () => {
    await tick();
    container.querySelector<HTMLElement>(".project-title-button")!.click();
    await tick();
    container.querySelector<HTMLInputElement>("input.project-title-input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(container.querySelector("input.project-title-input")).toBeNull();
    expect(renameProject).not.toHaveBeenCalled();
  });

  it("renders only reference titles and descriptions and removes references", async () => {
    fetchReferences.mockResolvedValue({ items: [{ id: "ref-1", title: "Wiki section", description: "Useful background", path: "/private/wiki/section.md" }] });
    window.dispatchEvent(new Event("chat-projects-changed"));
    dispose?.(); dispose = render(() => <ChatProject />, container);
    await tick();
    expect(container.textContent).toContain("Wiki section");
    expect(container.textContent).toContain("Useful background");
    expect(container.innerHTML).not.toContain("/private/wiki/section.md");
    fetchReferences.mockResolvedValue({ items: [] });
    container.querySelector<HTMLButtonElement>('button[aria-label="Remove reference Wiki section"]')!.click();
    await tick();
    const confirmButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "Remove");
    expect(confirmButton).toBeTruthy();
    confirmButton!.click();
    await tick();
    expect(deleteReference).toHaveBeenCalledWith("project-1", "ref-1");
    expect(container.textContent).not.toContain("Wiki section");
  });

  it("edits notes and preserves the draft after a timed out save", async () => {
    await tick();
    const textarea = container.querySelector<HTMLTextAreaElement>("#project-notes")!;
    expect(textarea.value).toBe("- Shared project learning");
    textarea.value = "- Another agent can use this";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    await tick();
    const notesCard = textarea.closest(".project-card")!;
    const saveButton = Array.from(notesCard.querySelectorAll("button")).find((btn) => btn.textContent?.trim() === "Save");
    expect(saveButton).toBeTruthy();
    saveButton!.click();
    await tick();
    expect(saveNotes).toHaveBeenCalledWith("project-1", "- Another agent can use this");
    saveNotes.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    fetchNotes.mockResolvedValue({ text: "- Shared project learning" });
    textarea.value = "- New draft after save";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    saveButton!.click();
    await tick();
    await tick();
    expect(container.querySelector(".project-error")?.textContent).toContain("Unable to save notes");
    expect(textarea.value).toBe("- New draft after save");
  });

  it("keeps project actions available after reference removal fails", async () => {
    fetchReferences.mockResolvedValue({ items: [{ id: "ref-1", title: "Wiki", description: "Context" }] });
    dispose?.(); dispose = render(() => <ChatProject />, container);
    await tick();
    deleteReference.mockRejectedValueOnce(new Error("Unavailable"));
    container.querySelector<HTMLButtonElement>('button[aria-label="Remove reference Wiki"]')!.click();
    await tick();
    const confirmButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "Remove");
    confirmButton!.click();
    await tick();
    expect(container.querySelector(".project-error")?.textContent).toContain("Unable to remove reference");
    expect(container.textContent).toContain("Context");
  });

  it("requires an explicit accessible agent choice and starts a fresh project chat", async () => {
    await tick();
    const newChatButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("New chat"));
    expect(newChatButton).toBeTruthy();
    newChatButton!.click();
    await tick();
    const agentRows = document.querySelectorAll(".agent-picker-row");
    expect(agentRows.length).toBe(2);
    expect(document.body.textContent).toContain("Writer");
    expect(document.body.textContent).toContain("Researcher");
    (agentRows[1] as HTMLButtonElement).click();
    expect(startNewChat).toHaveBeenCalledWith("agent-2");
    expect(navigate).toHaveBeenCalledWith("/chat/agent-2?project=project-1");
  });

  it("uploads and deletes files, displaying upload failures without blocking chat", async () => {
    await tick();
    fetchFiles.mockResolvedValue({ items: [{ id: "file-1", name: "notes.txt", size: 5, mimeType: "text/plain" }] });
    const input = container.querySelector<HTMLInputElement>("#project-file-upload")!;
    const file = new File(["Notes"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(uploadFile).toHaveBeenCalledWith("project-1", file);
    expect(container.textContent).toContain("notes.txt");
    fetchFiles.mockResolvedValue({ items: [] });
    container.querySelector<HTMLButtonElement>('button[aria-label="Delete notes.txt"]')!.click();
    await tick();
    const confirmButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "Delete");
    confirmButton!.click();
    await tick();
    expect(deleteFile).toHaveBeenCalledWith("project-1", "file-1");
    expect(container.textContent).not.toContain("notes.txt");
    uploadFile.mockRejectedValueOnce(new Error("Upload timed out"));
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(container.querySelector(".project-error")?.textContent).toBe("Upload timed out");
    expect(input.disabled).toBe(false);
  });

  it("loads and saves project instructions and reports save failures", async () => {
    await tick();
    const textarea = container.querySelector<HTMLTextAreaElement>("#project-instructions")!;
    expect(textarea.value).toBe("Be concise.");
    textarea.value = "Cite useful sources.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    await tick();
    const instructionsCard = textarea.closest(".project-card")!;
    const saveButton = Array.from(instructionsCard.querySelectorAll("button")).find((btn) => btn.textContent?.trim() === "Save");
    expect(saveButton).toBeTruthy();
    saveButton!.click();
    await tick();
    expect(saveInstructions).toHaveBeenCalledWith("project-1", "Cite useful sources.");
    saveInstructions.mockRejectedValueOnce(new Error("Unavailable"));
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    saveButton!.click();
    await tick();
    await tick();
    expect(container.querySelector(".project-error")?.textContent).toContain("Unable to save instructions");
  });

  it("renders 'Project not found.' and link to /agents when fetchChatProject rejects (404) without throwing", async () => {
    dispose?.();
    container.remove();
    fetchProject.mockRejectedValueOnce(new Error("Not found"));
    container = document.createElement("div");
    document.body.append(container);
    
    expect(() => {
      dispose = render(() => <ChatProject />, container);
    }).not.toThrow();
    
    await tick();
    await tick();
    
    expect(container.textContent).toContain("Project not found.");
    const link = container.querySelector('a[href="/agents"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("Back to agents");
  });
});
