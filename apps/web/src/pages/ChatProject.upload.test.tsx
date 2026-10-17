// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const {
  fetchChatProjectMock,
  fetchChatProjectFilesMock,
  fetchChatProjectReferencesMock,
  fetchChatProjectNotesMock,
  fetchAgentSessionsMock,
  fetchAgentsMock,
} = vi.hoisted(() => ({
  fetchChatProjectMock: vi.fn(),
  fetchChatProjectFilesMock: vi.fn(),
  fetchChatProjectReferencesMock: vi.fn(),
  fetchChatProjectNotesMock: vi.fn(),
  fetchAgentSessionsMock: vi.fn(),
  fetchAgentsMock: vi.fn(),
}));

vi.mock("../api/chat-projects", () => ({
  fetchChatProject: fetchChatProjectMock,
  fetchChatProjectFiles: fetchChatProjectFilesMock,
  fetchChatProjectReferences: fetchChatProjectReferencesMock,
  fetchChatProjectNotes: fetchChatProjectNotesMock,
  uploadChatProjectFile: vi.fn(),
  deleteChatProjectFile: vi.fn(),
  deleteChatProject: vi.fn(),
  renameChatProject: vi.fn(),
  updateChatProjectInstructions: vi.fn(),
  deleteChatProjectReference: vi.fn(),
  updateChatProjectNotes: vi.fn(),
}));

vi.mock("../api", () => ({
  fetchAgentSessions: fetchAgentSessionsMock,
  fetchAgents: fetchAgentsMock,
  startNewChat: vi.fn(),
}));

vi.mock("@solidjs/router", () => ({
  A: (props: any) => <a {...props} />,
  useParams: () => ({ id: "test-project" }),
  useNavigate: () => vi.fn(),
}));

let root: HTMLDivElement;
let dispose: () => void;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fetchChatProjectMock.mockResolvedValue({
    id: "test-project",
    name: "Test Project",
    instructions: "",
  });
  fetchChatProjectFilesMock.mockResolvedValue({ items: [] });
  fetchChatProjectReferencesMock.mockResolvedValue({ items: [] });
  fetchChatProjectNotesMock.mockResolvedValue({ text: "" });
  fetchAgentSessionsMock.mockResolvedValue({ items: [] });
  fetchAgentsMock.mockResolvedValue([]);

  root = document.createElement("div");
  document.body.appendChild(root);
});

afterEach(() => {
  dispose?.();
  root.remove();
  vi.clearAllMocks();
});

describe("ChatProject file upload", () => {
  it("clicking Upload button triggers file input click", async () => {
    const { ChatProject } = await import("./ChatProject");
    dispose = render(() => <ChatProject />, root);
    await tick();

    const fileInput = document.getElementById("project-file-upload") as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const clickSpy = vi.spyOn(fileInput, "click");

    const uploadButton = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Upload")
    );
    expect(uploadButton).toBeTruthy();

    uploadButton!.click();
    await tick();

    expect(clickSpy).toHaveBeenCalled();
  });
});
