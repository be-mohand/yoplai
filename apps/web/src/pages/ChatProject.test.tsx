// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const { navigate, fetchProject, saveInstructions, startNewChat } = vi.hoisted(() => ({
  navigate: vi.fn(), fetchProject: vi.fn(), saveInstructions: vi.fn(), startNewChat: vi.fn(),
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
