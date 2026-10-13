// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const navigate = vi.fn();
const createChatProject = vi.fn();
const draftChatProjectInstructions = vi.fn();
const uploadChatProjectFile = vi.fn();
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));
vi.mock("../../api/chat-projects", () => ({
  createChatProject: (...args: unknown[]) => createChatProject(...args),
  draftChatProjectInstructions: (...args: unknown[]) => draftChatProjectInstructions(...args),
  uploadChatProjectFile: (...args: unknown[]) => uploadChatProjectFile(...args),
}));

import { CreateProjectModal } from "./CreateProjectModal";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const onClose = vi.fn();
  const dispose = render(() => <CreateProjectModal onClose={onClose} />, container);
  const type = (el: Element, value: string) => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const addFiles = (...files: File[]) => {
    const input = document.querySelector<HTMLInputElement>("[data-testid=create-project-file-input]")!;
    Object.defineProperty(input, "files", { value: files, configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const create = () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Create") || b.textContent?.includes("…"))!;
    button.click();
  };
  return { dispose, onClose, type, addFiles, create };
}

describe("CreateProjectModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows the purpose label and sends purpose on create", async () => {
    createChatProject.mockResolvedValue({ id: "p1" });
    const { dispose, type, create, onClose } = setup();
    await tick();
    expect(document.body.textContent).toContain("What's the purpose of this project? (optional)");
    type(document.querySelector("input")!, "Deck");
    type(document.querySelector("textarea")!, "Q3 board deck");
    create();
    await tick();
    expect(createChatProject).toHaveBeenCalledWith("Deck");
    expect(draftChatProjectInstructions).toHaveBeenCalledWith("p1", "Q3 board deck");
    expect(navigate).toHaveBeenCalledWith("/p/p1");
    expect(onClose).toHaveBeenCalled();
    dispose();
  });

  it("draft failure then retry does not recreate the project or redraft once drafted", async () => {
    createChatProject.mockResolvedValue({ id: "p1" });
    draftChatProjectInstructions.mockRejectedValueOnce(new Error("aborted")).mockResolvedValue({ id: "p1" });
    const { dispose, type, create, onClose } = setup();
    await tick();
    type(document.querySelector("input:not([type=file])")!, "Deck");
    type(document.querySelector("textarea")!, "Q3 board deck");
    create();
    await tick();
    expect(document.body.textContent).toContain("aborted");
    expect(onClose).not.toHaveBeenCalled();
    create();
    await tick();
    expect(createChatProject).toHaveBeenCalledTimes(1);
    expect(draftChatProjectInstructions).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/p/p1");
    dispose();
  });

  it("does not redraft after a successful draft when an upload fails", async () => {
    createChatProject.mockResolvedValue({ id: "p1" });
    draftChatProjectInstructions.mockResolvedValue({ id: "p1" });
    uploadChatProjectFile.mockRejectedValueOnce(new Error("Too big")).mockResolvedValue(undefined);
    const { dispose, type, addFiles, create } = setup();
    await tick();
    type(document.querySelector("input:not([type=file])")!, "Deck");
    type(document.querySelector("textarea")!, "Q3 board deck");
    addFiles(new File(["a"], "a.txt"));
    await tick();
    create();
    await tick();
    create();
    await tick();
    expect(createChatProject).toHaveBeenCalledTimes(1);
    expect(draftChatProjectInstructions).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/p/p1");
    dispose();
  });

  it("adds and removes file chips", async () => {
    const { dispose, addFiles } = setup();
    await tick();
    addFiles(new File(["abc"], "a.txt"), new File(["defg"], "b.txt"));
    await tick();
    expect(document.body.textContent).toContain("a.txt");
    expect(document.body.textContent).toContain("3 B");
    document.querySelector<HTMLButtonElement>("[aria-label='Remove a.txt']")!.click();
    await tick();
    expect(document.body.textContent).not.toContain("a.txt");
    expect(document.body.textContent).toContain("b.txt");
    dispose();
  });

  it("uploads files after create and retries only failed files without recreating", async () => {
    createChatProject.mockResolvedValue({ id: "p1" });
    uploadChatProjectFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Too big")).mockResolvedValue(undefined);
    const { dispose, type, addFiles, create, onClose } = setup();
    await tick();
    type(document.querySelector("input:not([type=file])")!, "Deck");
    const a = new File(["a"], "a.txt");
    const b = new File(["b"], "b.txt");
    addFiles(a, b);
    await tick();
    create();
    await tick();
    expect(uploadChatProjectFile).toHaveBeenNthCalledWith(1, "p1", a);
    expect(uploadChatProjectFile).toHaveBeenNthCalledWith(2, "p1", b);
    expect(document.body.textContent).toContain("Too big");
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("a.txt");
    create();
    await tick();
    expect(createChatProject).toHaveBeenCalledTimes(1);
    expect(uploadChatProjectFile).toHaveBeenCalledTimes(3);
    expect(uploadChatProjectFile).toHaveBeenLastCalledWith("p1", b);
    expect(navigate).toHaveBeenCalledWith("/p/p1");
    dispose();
  });
});
