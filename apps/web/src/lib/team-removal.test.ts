import { describe, expect, it } from "vitest";
import { teamRemovalWarning } from "./team-removal";

describe("teamRemovalWarning", () => {
  it("says only a superadmin can reassign a Private agent left with no team", () => {
    expect(teamRemovalWarning("Connie", "Content", true, false)).toBe("If you remove Connie from Content, Connie has no team. Only a superadmin can assign Connie to a team again.");
  });

  it("says any admin can reassign a Public agent left with no team", () => {
    const text = teamRemovalWarning("Connie", "Content", true, true);
    expect(text).toBe("If you remove Connie from Content, Connie has no team. Connie stays Public, so you or any admin can add Connie to a team again.");
    expect(text).not.toContain("superadmin");
  });

  it("describes chat access when other teams remain", () => {
    expect(teamRemovalWarning("Connie", "this team", false, false)).toBe("If you remove Connie from this team, members of this team can no longer chat with Connie.");
    expect(teamRemovalWarning("Connie", "this team", false, true)).toBe("If you remove Connie from this team, Connie stays Public, so members of this team can still chat with Connie.");
  });
});
