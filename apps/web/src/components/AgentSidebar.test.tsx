// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";

// matchMedia must exist before theme.ts module-level code runs
window.matchMedia = vi.fn().mockReturnValue({ matches: false });

const [pathname, setPathname] = createSignal("/projects");
const fetchProjectsMock = vi.fn<() => Promise<unknown[]>>();
const fetchAgentSessionsMock = vi.fn(async () => ({ items: [] as unknown[] }));
const navigateMock = vi.fn();
const pinAgentSessionMock = vi.fn(async () => {});
const fetchTopExtensionsMock = vi.fn(async () => ({ extensions: ["exa"], mcp: [] as string[] }));

class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

vi.mock("../api", () => ({
  fetchProjects: fetchProjectsMock,
  fetchAgentSessions: fetchAgentSessionsMock,
  deleteAgentSession: vi.fn(),
  renameAgentSession: vi.fn(),
  pinAgentSession: pinAgentSessionMock,
  UnauthenticatedError,
}));

vi.mock("../api/top-extensions", () => ({
  EMPTY_TOP_EXTENSIONS: { extensions: [], mcp: [] },
  fetchTopExtensions: fetchTopExtensionsMock,
}));

vi.mock("@solidjs/router", () => ({
  A: (props: Record<string, unknown>) => <a {...props} />,
  useLocation: () => ({
    get pathname() {
      return pathname();
    },
    search: "",
  }),
  useNavigate: () => navigateMock,
}));

const { AgentSidebar } = await import("./AgentSidebar");
const { connectPromptRequest, clearConnectPromptRequest } = await import("../onboarding/state");
const { resetCapabilitiesForTests, setCapabilitiesForTests } = await import(
  "../lib/capabilities"
);

describe("AgentSidebar", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("yoplai-theme");
    localStorage.removeItem("yoplai:recent-project-views");
    setPathname("/projects");
    pinAgentSessionMock.mockReset();
    pinAgentSessionMock.mockResolvedValue(undefined);
    fetchAgentSessionsMock.mockResolvedValue({ items: [] });
    vi.useRealTimers();
    fetchProjectsMock.mockReset();
    fetchProjectsMock.mockResolvedValue([]);
    resetCapabilitiesForTests();
    vi.clearAllMocks();
  });

  it("renders sidebar logo and primary navigation links", () => {
    setCapabilitiesForTests({
      extensions: { projects: true },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    expect(container.textContent).toContain("Yoplai");
    expect(container.textContent).toContain("Projects");
    expect(container.textContent).toContain("Agents");

    dispose();
  });

  it("renders labeled Font Awesome icons instead of abbreviations when collapsed", () => {
    setCapabilitiesForTests({
      extensions: { projects: true, orchestrator: true },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(true);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    const expectedIcons = [
      ["Projects", "fa-folder-tree"],
      ["Orchestrator", "fa-diagram-project"],
      ["Agents", "fa-comments"],
    ];
    for (const [label, iconClass] of expectedIcons) {
      const link = container.querySelector(`a[title="${label}"]`);
      expect(link?.textContent).toBe(label);
      expect(link?.querySelector(`.${iconClass}`)?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(container.querySelector(".nav-short")).toBeNull();

    dispose();
  });

  it("renders theme toggle button", () => {
    setCapabilitiesForTests({
      extensions: { projects: true },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    const toggle = container.querySelector(".theme-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent).toMatch(/Light|Dark/);

    dispose();
  });

  it("toggles theme on click", () => {
    setCapabilitiesForTests({
      extensions: { projects: true },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    const toggle = container.querySelector(".theme-toggle") as HTMLButtonElement;
    const initialTheme = document.documentElement.getAttribute("data-theme");
    toggle.click();
    const newTheme = document.documentElement.getAttribute("data-theme");
    expect(newTheme).not.toBe(initialTheme);

    dispose();
  });

  it("does not render recents anymore", async () => {
    setCapabilitiesForTests({
      extensions: { projects: true },
    });
    localStorage.setItem(
      "yoplai:recent-project-views",
      JSON.stringify([{ id: "PRO-1", viewedAt: Date.now() - 60_000 }])
    );
    setPathname("/projects/PRO-2");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(container.querySelector(".sidebar-recent")).toBeNull();

    const stored = JSON.parse(
      localStorage.getItem("yoplai:recent-project-views") ?? "[]"
    );
    expect(stored[0]?.id).toBe("PRO-1");

    dispose();
  });

  it("renders session avatar from configured session data and no new button", async () => {
    fetchAgentSessionsMock.mockResolvedValue({
      items: [
        {
          agentId: "alpha",
          sessionId: "s1",
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 1,
          firstUserMessage: "Hello",
          avatar: "🦊",
          isMain: true,
        },
      ],
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(container.textContent).toContain("🦊");
    expect(container.textContent).not.toContain("+ New");

    dispose();
  });

  it("orders pinned above recent with recency groups, shared search and live unpin", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const session = (sessionId: string, lastActivity: number, pinned: number | null) => ({
      agentId: "alpha", sessionId, createdAt: lastActivity, lastActivity,
      messageCount: 1, firstUserMessage: sessionId, isMain: false, pinned,
    });
    const items = [session("Recent chat", now, null), session("Pinned today", now - 1000, now), session("Pinned old", now - 10 * 86400000, now)];
    fetchAgentSessionsMock.mockResolvedValue({ items });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = render(() => <AgentSidebar collapsed={() => false} onToggleCollapse={() => {}} />, container);
    await vi.advanceTimersByTimeAsync(1);
    const labels = () => Array.from(container.querySelectorAll(".session-title-text")).map((node) => node.textContent);
    expect(labels()).toEqual(["Pinned today", "Pinned old", "Recent chat"]);
    const sections = container.querySelectorAll(".sessions-section");
    expect(sections[0].getAttribute("aria-label")).toBe("Pinned");
    expect(sections[1].getAttribute("aria-label")).toBe("Recent");
    expect(sections[0].querySelectorAll(".sessions-group")).toHaveLength(2);
    expect(sections[1].textContent).not.toContain("Pinned today");
    container.querySelector<HTMLButtonElement>('[aria-label="Search sessions"]')!.click();
    const input = container.querySelector<HTMLInputElement>(".sessions-search")!;
    input.value = "Pinned old";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(labels()).toEqual(["Pinned old"]);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const unpin = Array.from(container.querySelectorAll<HTMLButtonElement>(".session-action")).find((button) => button.textContent?.trim() === "Unpin")!;
    fetchAgentSessionsMock.mockResolvedValue({ items: items.map((item) => ({ ...item, pinned: null })) });
    unpin.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(pinAgentSessionMock).toHaveBeenCalledWith("alpha", "Pinned today", false);
    expect(container.querySelector('[aria-label="Pinned"]')).toBeNull();
    expect(labels()).toEqual(["Recent chat", "Pinned today", "Pinned old"]);
    fetchAgentSessionsMock.mockResolvedValue({ items });
    await vi.advanceTimersByTimeAsync(3000);
    expect(labels()).toEqual(["Pinned today", "Pinned old", "Recent chat"]);
    dispose();
  });

  it("keeps the session menu open and focused across an equivalent poll", async () => {
    vi.useFakeTimers();
    const item = {
      agentId: "alpha", sessionId: "stable", createdAt: Date.now(), lastActivity: Date.now(),
      messageCount: 1, firstUserMessage: "Stable chat", isMain: false, pinned: null,
    };
    fetchAgentSessionsMock.mockResolvedValue({ items: [item] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = render(() => <AgentSidebar collapsed={() => false} onToggleCollapse={() => {}} />, container);
    await vi.advanceTimersByTimeAsync(1);
    const menu = container.querySelector<HTMLDetailsElement>("details")!;
    menu.open = true;
    const action = menu.querySelector<HTMLButtonElement>("button")!;
    action.focus();
    fetchAgentSessionsMock.mockResolvedValue({ items: [{ ...item }] });
    await vi.advanceTimersByTimeAsync(3000);
    expect(container.querySelector("details")).toBe(menu);
    expect(menu.open).toBe(true);
    expect(document.activeElement).toBe(action);
    await vi.advanceTimersByTimeAsync(60000);
    expect(container.querySelector(".session-meta")?.textContent).toContain("1m");
    expect(container.querySelector("details")).toBe(menu);
    expect(menu.open).toBe(true);
    expect(document.activeElement).toBe(action);
    action.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(pinAgentSessionMock).toHaveBeenCalledWith("alpha", "stable", true);
    dispose();
  });

  it("reports pin failure, clears the error on retry, and polls during a hanging pin", async () => {
    vi.useFakeTimers();
    const item = {
      agentId: "alpha", sessionId: "failure", createdAt: Date.now(), lastActivity: Date.now(),
      messageCount: 1, firstUserMessage: "Original chat", isMain: false, pinned: null,
    };
    fetchAgentSessionsMock.mockResolvedValue({ items: [item] });
    pinAgentSessionMock.mockRejectedValueOnce(new Error("Gateway unavailable"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = render(() => <AgentSidebar collapsed={() => false} onToggleCollapse={() => {}} />, container);
    await vi.advanceTimersByTimeAsync(1);
    container.querySelector<HTMLButtonElement>(".session-action")!.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Failed to update session pin");
    let finishPin: (() => void) | undefined;
    pinAgentSessionMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishPin = resolve; }));
    container.querySelector<HTMLButtonElement>(".session-action")!.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    fetchAgentSessionsMock.mockResolvedValue({ items: [{ ...item, title: "Updated while pin waits" }] });
    await vi.advanceTimersByTimeAsync(3000);
    expect(container.querySelector(".session-title-text")?.textContent).toBe("Updated while pin waits");
    expect(fetchAgentSessionsMock).toHaveBeenCalledTimes(2);
    finishPin!();
    await vi.advanceTimersByTimeAsync(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    dispose();
  });

  it("hides component nav links when capabilities disable them", () => {
    setCapabilitiesForTests({ extensions: {} });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    expect(container.textContent).not.toContain("Projects");
    expect(container.textContent).not.toContain("Teams");
    expect(container.textContent).toContain("Agents");

    dispose();
  });

  it("shows Teams only in multi-user forked-agent mode", () => {
    setCapabilitiesForTests({
      multiUser: true,
      forkedAgents: true,
      extensions: {},
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    expect(container.textContent).toContain("Teams");
    const teamsLink = container.querySelector('a[title="Teams"]');
    expect(teamsLink?.querySelector(".fa-users")?.getAttribute("aria-hidden")).toBe("true");

    dispose();
  });

  it("navigates to /login and stops polling on 401 from fetchAgentSessions", async () => {
    vi.useFakeTimers();
    fetchAgentSessionsMock.mockRejectedValue(new UnauthenticatedError());

    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);

    const dispose = render(
      () => (
        <AgentSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {}}
        />
      ),
      container
    );

    // Let the initial createEffect fetch settle (microtasks + async rejection)
    await vi.advanceTimersByTimeAsync(50);

    expect(navigateMock).toHaveBeenCalledWith("/login");

    navigateMock.mockClear();

    // Advance past several poll intervals — polling must be stopped, no further navigations
    await vi.advanceTimersByTimeAsync(15000);

    expect(navigateMock).not.toHaveBeenCalled();

    dispose();
    vi.useRealTimers();
  });

  it("shows Connect tools after Restart tour on agent chat routes and opens the prompt", async () => {
    setCapabilitiesForTests({
      multiUser: true,
      user: { id: "u1", role: "user" },
      extensions: { projects: true },
    } as never);
    setPathname("/chat/scribe");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);
    const dispose = render(
      () => <AgentSidebar collapsed={collapsed} onToggleCollapse={() => {}} />,
      container
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Connect tools"));
    // Both links share one row.
    const labels = Array.from(container.querySelectorAll<HTMLButtonElement>(".tour-links > button.tour-restart")).map(
      (b) => b.textContent?.trim()
    );
    expect(labels).toEqual(["Restart tour", "Connect tools"]);
    container.querySelectorAll<HTMLButtonElement>("button.tour-restart")[1].click();
    expect(connectPromptRequest()?.agentId).toBe("scribe");
    clearConnectPromptRequest();
    dispose();
  });

  it("hides Connect tools when no extension is starred as top", async () => {
    fetchTopExtensionsMock.mockResolvedValueOnce({ extensions: [], mcp: [] });
    setCapabilitiesForTests({
      multiUser: true,
      user: { id: "u1", role: "user" },
      extensions: { projects: true },
    } as never);
    setPathname("/chat/scribe");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);
    const dispose = render(
      () => <AgentSidebar collapsed={collapsed} onToggleCollapse={() => {}} />,
      container
    );
    await vi.waitFor(() => expect(fetchTopExtensionsMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toContain("Restart tour");
    expect(container.textContent).not.toContain("Connect tools");
    dispose();
  });

  it("hides Connect tools outside agent chat routes", () => {
    setCapabilitiesForTests({
      multiUser: true,
      user: { id: "u1", role: "user" },
      extensions: { projects: true },
    } as never);
    setPathname("/projects");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [collapsed] = createSignal(false);
    const dispose = render(
      () => <AgentSidebar collapsed={collapsed} onToggleCollapse={() => {}} />,
      container
    );
    expect(container.textContent).toContain("Restart tour");
    expect(container.textContent).not.toContain("Connect tools");
    dispose();
  });
});
