// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const {
  fetchAgentSessionsMock,
  archiveAgentSessionMock,
  deleteAgentSessionMock,
  navigateMock,
} = vi.hoisted(() => ({
  fetchAgentSessionsMock: vi.fn(),
  archiveAgentSessionMock: vi.fn(),
  deleteAgentSessionMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("../api", () => ({
  fetchAgentSessions: fetchAgentSessionsMock,
  archiveAgentSession: archiveAgentSessionMock,
  deleteAgentSession: deleteAgentSessionMock,
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../components/LeftNavShell", () => ({
  LeftNavShell: (props: { children: unknown }) => props.children,
}));

import { SessionArchive } from "./SessionArchive";

let root: HTMLDivElement;
let dispose: () => void;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fetchAgentSessionsMock.mockReset();
  archiveAgentSessionMock.mockReset();
  deleteAgentSessionMock.mockReset();
  navigateMock.mockReset();
  root = document.createElement("div");
  document.body.appendChild(root);
});

afterEach(() => {
  dispose?.();
  root.remove();
});

describe("SessionArchive", () => {
  it("renders list from mocked fetchAgentSessions filtering archived sessions", async () => {
    fetchAgentSessionsMock.mockResolvedValue({
      items: [
        {
          agentId: "alpha",
          sessionId: "s1",
          createdAt: Date.now() - 86400000,
          lastActivity: Date.now() - 3600000,
          messageCount: 5,
          firstUserMessage: "Archived chat",
          archived: Date.now() - 3600000,
          isMain: false,
          pinned: null,
        },
        {
          agentId: "beta",
          sessionId: "s2",
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 2,
          firstUserMessage: "Another archived",
          archived: Date.now() - 7200000,
          isMain: false,
          pinned: null,
        },
      ],
    });
    dispose = render(() => <SessionArchive />, root);
    await tick();
    expect(fetchAgentSessionsMock).toHaveBeenCalledWith({ includeArchived: true });
    expect(root.textContent).toContain("Archived chat");
    expect(root.textContent).toContain("Another archived");
    expect(root.textContent).toContain("alpha");
    expect(root.textContent).toContain("beta");
  });

  it("shows empty state when no archived chats", async () => {
    fetchAgentSessionsMock.mockResolvedValue({ items: [] });
    dispose = render(() => <SessionArchive />, root);
    await tick();
    expect(root.textContent).toContain("No archived chats.");
  });

  it("calls archiveAgentSession on Restore and removes row", async () => {
    fetchAgentSessionsMock.mockResolvedValue({
      items: [
        {
          agentId: "alpha",
          sessionId: "s1",
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 3,
          firstUserMessage: "Restore me",
          archived: Date.now() - 3600000,
          isMain: false,
          pinned: null,
        },
      ],
    });
    archiveAgentSessionMock.mockResolvedValue(undefined);
    dispose = render(() => <SessionArchive />, root);
    await tick();
    expect(root.textContent).toContain("Restore me");
    const restoreButton = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent === "Restore"
    );
    expect(restoreButton).toBeTruthy();
    restoreButton!.click();
    await tick();
    expect(archiveAgentSessionMock).toHaveBeenCalledWith("alpha", "s1", false);
    expect(root.textContent).not.toContain("Restore me");
  });

  it("opens confirm dialog on Delete and calls deleteAgentSession", async () => {
    fetchAgentSessionsMock.mockResolvedValue({
      items: [
        {
          agentId: "gamma",
          sessionId: "s3",
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 1,
          firstUserMessage: "Delete me",
          archived: Date.now() - 7200000,
          isMain: false,
          pinned: null,
        },
      ],
    });
    deleteAgentSessionMock.mockResolvedValue(undefined);
    dispose = render(() => <SessionArchive />, root);
    await tick();
    expect(root.textContent).toContain("Delete me");
    const deleteButton = Array.from(root.querySelectorAll<HTMLButtonElement>(".archive-session-actions button")).find(
      (btn) => btn.textContent === "Delete"
    );
    expect(deleteButton).toBeTruthy();
    deleteButton!.click();
    await tick();
    expect(root.textContent).toContain("Delete archived chat?");
    expect(root.textContent).toContain("This will permanently delete the chat and all its history.");
    const dialog = root.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    const confirmButton = Array.from(dialog!.querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) => btn.textContent === "Delete"
    );
    expect(confirmButton).toBeTruthy();
    confirmButton!.click();
    await tick();
    expect(deleteAgentSessionMock).toHaveBeenCalledWith("gamma", "s3");
    expect(root.textContent).not.toContain("Delete me");
  });

  it("navigates to chat view on Open", async () => {
    fetchAgentSessionsMock.mockResolvedValue({
      items: [
        {
          agentId: "delta",
          sessionId: "s4",
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 10,
          firstUserMessage: "Open me",
          archived: Date.now() - 1800000,
          isMain: false,
          pinned: null,
        },
      ],
    });
    dispose = render(() => <SessionArchive />, root);
    await tick();
    const openButton = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent === "Open"
    );
    expect(openButton).toBeTruthy();
    openButton!.click();
    expect(navigateMock).toHaveBeenCalledWith("/chat/delta?session=s4");
  });
});
