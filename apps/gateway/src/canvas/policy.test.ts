import { describe, expect, it } from "vitest";
import { DashboardAccessPolicy } from "./policy.js";
import type { DashboardRegistration } from "./store.js";

describe("dashboard access policy", () => {
  it("keeps owned grants independent of agent access and denies ineligible accounts", () => {
    const policy = new DashboardAccessPolicy();
    const entry: DashboardRegistration = {
      id: "dashboard",
      agentId: "agent",
      slug: "page.html",
      ownerUserId: "alice",
      shares: [
        { kind: "user", id: "bob", mode: "read" },
        { kind: "user", id: "carol", mode: "write" },
      ],
    };
    const outcomes = ["alice", "bob", "carol", "dave"].map((userId) => {
      const actor = { userId, eligible: true, hasAgentAccess: false };
      return [
        policy.canRead(entry, actor),
        policy.canWrite(entry, actor),
        policy.canManage(entry, actor),
      ];
    });
    expect(outcomes).toEqual([
      [true, true, true],
      [true, false, false],
      [true, true, false],
      [false, false, false],
    ]);
    expect(policy.canRead(entry, { userId: "alice", eligible: false })).toBe(
      false
    );
    expect(policy.canWrite(entry, { eligible: true, superadmin: true })).toBe(
      false
    );
    expect(policy.canRead(entry, { eligible: true, superadmin: true })).toBe(
      true
    );
  });

  it("limits service actors to platform grants and keeps legacy access agent-gated", () => {
    const policy = new DashboardAccessPolicy();
    const base = { id: "dashboard", agentId: "agent", slug: "page.html" };
    const service = { eligible: true, hasAgentAccess: true };
    const privateDashboard = { ...base, ownerUserId: "alice", shares: [] };
    const individual: DashboardRegistration = {
      ...privateDashboard,
      shares: [{ kind: "user", id: "alice", mode: "write" }],
    };
    const allRead: DashboardRegistration = {
      ...privateDashboard,
      shares: [{ kind: "all", mode: "read" }],
    };
    const allWrite: DashboardRegistration = {
      ...privateDashboard,
      shares: [{ kind: "all", mode: "write" }],
    };
    expect(
      [privateDashboard, individual, allRead, allWrite, base].map((entry) => [
        policy.canRead(entry, service),
        policy.canWrite(entry, service),
        policy.canManage(entry, service),
      ])
    ).toEqual([
      [false, false, false],
      [false, false, false],
      [true, false, false],
      [true, true, false],
      [true, true, true],
    ]);
    expect(
      policy.filterVisible([privateDashboard, allRead, base], {
        eligible: true,
        hasAgentAccess: false,
      })
    ).toEqual([allRead]);
    expect(
      policy.filterVisible([privateDashboard, allRead, base], {
        eligible: false,
        hasAgentAccess: true,
      })
    ).toEqual([]);
  });
});
