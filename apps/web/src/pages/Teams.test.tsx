// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "solid-js";
import { render } from "solid-js/web";
import type { Team } from "../api/teams";

const mocks = vi.hoisted(() => ({
  fetchTeams: vi.fn(),
  fetchTeamlessUsers: vi.fn(),
  addTeamMember: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  fetchTeamMembers: vi.fn(),
  fetchTeamAgents: vi.fn(),
  fetchUsers: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("../api/teams", () => ({
  ...mocks,
  deleteTeam: vi.fn(),
  fetchDeleteTeamPreview: vi.fn(),
  removeForkFromTeam: vi.fn(),
  setTeamMembers: vi.fn(),
}));
vi.mock("../api/admin", () => ({ fetchUsers: mocks.fetchUsers }));
vi.mock("../auth/client", () => ({ useSession: mocks.useSession }));
vi.mock("@solidjs/router", () => ({ A: () => document.createElement("a") }));

import { Teams } from "./Teams";

const team: Team = {
  id: "team-1", name: "Research", description: null, color: "#6b7280",
  icon: "fa-solid fa-users", allUsers: false, private: true, memberCount: 1, canManage: true,
  createdBy: "admin", createdAt: "2026-10-07",
};

describe("team organization", () => {
  let container: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchTeams.mockResolvedValue([team, { ...team, id: "foreign", name: "HR", canManage: false }]);
    mocks.fetchTeamlessUsers.mockResolvedValue([{ id: "newcomer", name: "Newcomer", email: "new@example.test", approved: false, role: "user" }]);
    mocks.addTeamMember.mockResolvedValue({ teamId: team.id, allUsers: false, members: [] });
    mocks.fetchTeamMembers.mockResolvedValue({ teamId: team.id, allUsers: false, members: [{ id: "user-1", name: "Member", email: null }] });
    mocks.fetchTeamAgents.mockResolvedValue([]);
    mocks.fetchUsers.mockResolvedValue([]);
    mocks.useSession.mockReturnValue(() => ({ data: { user: { role: "superadmin" } } }));
    container = document.createElement("div");
    document.body.append(container);
    dispose = render(() => <Teams />, container);
  });

  afterEach(() => {
    dispose();
    container.remove();
  });

  async function click(label: string) {
    await vi.waitFor(() => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
      expect(button).toBeDefined();
      button!.click();
    });
  }

  it("places a pending team-less newcomer using only manageable teams", async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("No team (1)"));
    expect(container.textContent).toContain("Newcomer");
    expect(container.textContent).toContain("new@example.test");
    expect(container.textContent).toContain("Pending");
    const picker = container.querySelector<HTMLSelectElement>('[aria-label="Team for Newcomer"]')!;
    expect([...picker.options].map((option) => option.text)).toEqual(["Choose a team", "Research"]);
    picker.value = team.id;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await click("Add to team");
    await vi.waitFor(() => expect(mocks.addTeamMember).toHaveBeenCalledWith(team.id, "newcomer"));
    await vi.waitFor(() => expect(container.textContent).toContain("Everyone is in a team"));
    expect(container.textContent).not.toContain("Newcomer");
  });

  it("keeps placement retryable after failure and the rest of the page usable during a hung add", async () => {
    mocks.addTeamMember.mockRejectedValueOnce(new Error("Placement failed"));
    await vi.waitFor(() => expect(container.textContent).toContain("No team (1)"));
    const picker = container.querySelector<HTMLSelectElement>('[aria-label="Team for Newcomer"]')!;
    picker.value = team.id;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await click("Add to team");
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Placement failed"));
    expect(container.textContent).toContain("Newcomer");
    mocks.addTeamMember.mockImplementation(() => new Promise(() => {}));
    await click("Add to team");
    const adding = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Adding…")!;
    expect(adding.disabled).toBe(true);
    adding.click();
    expect(mocks.addTeamMember).toHaveBeenCalledTimes(2);
    await click("Members");
    await click("Close");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("disables placement with a hint for staff who manage no teams", async () => {
    dispose();
    mocks.fetchTeams.mockResolvedValue([{ ...team, canManage: false }]);
    mocks.useSession.mockReturnValue(() => ({ data: { user: { role: "admin" } } }));
    dispose = render(() => <Teams />, container);
    await vi.waitFor(() => expect(container.textContent).toContain("No team (1)"));
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Team for Newcomer"]')?.disabled).toBe(true);
    expect(container.textContent).toContain("You do not manage any teams");
  });

  it("keeps teams usable when the No team directory fails to load", async () => {
    dispose();
    mocks.fetchTeamlessUsers.mockRejectedValue(new Error("Directory offline"));
    dispose = render(() => <ErrorBoundary fallback={<p>Page failed</p>}><Teams /></ErrorBoundary>, container);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Directory offline"));
    expect(container.textContent).toContain("Research");
    expect(container.textContent).not.toContain("Everyone is in a team");
    await click("Members");
    await click("Close");
  });

  it("shows Public and Private badges on the team's owned agents", async () => {
    mocks.fetchTeamAgents.mockResolvedValue([
      { sourcePoolId: "casey", forkAgentId: "Casey", public: true, assignment: { mode: "list", teamIds: [team.id] } },
      { sourcePoolId: "henry", forkAgentId: "Henry", public: false, assignment: { mode: "list", teamIds: [team.id] } },
    ]);
    await click("Members");
    await vi.waitFor(() => expect(container.textContent).toContain("Casey"));
    const rows = [...container.querySelectorAll(".team-member")];
    expect(rows.find((row) => row.textContent?.includes("Casey"))?.textContent).toContain("Public");
    expect(rows.find((row) => row.textContent?.includes("Henry"))?.textContent).toContain("Private");
  });

  it("hides the No team directory from regular users", async () => {
    dispose();
    mocks.fetchTeamlessUsers.mockClear();
    mocks.useSession.mockReturnValue(() => ({ data: { user: { role: "user" } } }));
    dispose = render(() => <Teams />, container);
    await vi.waitFor(() => expect(container.textContent).toContain("Research"));
    expect(container.querySelector(".teams-no-team")).toBeNull();
    expect(mocks.fetchTeamlessUsers).not.toHaveBeenCalled();
  });

  it("omits obsolete team privacy controls while preserving member management", async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("Research"));
    expect(container.querySelector(".team-card__private")).toBeNull();
    await click("New team");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await click("Cancel");
    [...container.querySelectorAll("article")].find((card) => card.textContent?.includes("Research"))!.querySelector<HTMLButtonElement>("button")!.click();
    expect(container.querySelector('[aria-label="Private team"]')).toBeNull();
    expect(container.textContent).not.toContain("auto-join");
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.textContent).toContain("Member");
  });

});

describe("admin team scoping", () => {
  it("hides create/delete from admins and edit on teams they don't belong to", async () => {
    vi.resetAllMocks();
    mocks.fetchTeams.mockResolvedValue([
      { ...team, id: "own", name: "Own", canManage: true },
      { ...team, id: "other", name: "Other", canManage: false },
    ]);
    mocks.fetchTeamlessUsers.mockResolvedValue([]);
    mocks.useSession.mockReturnValue(() => ({ data: { user: { role: "admin" } } }));
    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => <Teams />, container);
    await vi.waitFor(() => expect(container.textContent).toContain("Other"));
    const labels = [...container.querySelectorAll("button")].map((button) => button.textContent?.trim());
    expect(labels).not.toContain("New team");
    expect(labels).not.toContain("Delete");
    expect(labels.filter((label) => label === "Edit")).toHaveLength(1);
    dispose();
    container.remove();
  });
});
